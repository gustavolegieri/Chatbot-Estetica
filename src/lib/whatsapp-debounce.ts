import { normalizePhone } from "./utils";
import { prisma } from "./prisma";

// Um atendimento com IA, voz e mídia pode ultrapassar 15 segundos. O lock só
// é considerado abandonado depois de um minuto para impedir estados paralelos.
const LOCK_STALE_MS = 60_000;
const LOCK_WAIT_MS = 25_000;
const LOCK_RETRY_MS = 180;

interface IncomingPayload {
  phone: string;
  text: string;
  pushName?: string;
  buttonId?: string;
  listId?: string;
  sourceType?: "text" | "audio";
  messageId?: string;
}

// Serializa imediatamente as mensagens dentro da mesma instância. Diferente
// do debounce antigo, nenhuma mensagem é substituída e toda Promise termina.
const localChains = new Map<string, Promise<void>>();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function acquireLock(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  const result = await prisma.whatsAppSession.updateMany({
    where: {
      phone: normalized,
      OR: [
        { processingLockedAt: null },
        { processingLockedAt: { lt: staleThreshold } },
      ],
    },
    data: { processingLockedAt: now },
  });
  if (result.count > 0) return true;

  const exists = await prisma.whatsAppSession.findUnique({
    where: { phone: normalized },
    select: { phone: true },
  });
  if (exists) return false;

  try {
    await prisma.whatsAppSession.create({
      data: {
        phone: normalized,
        processingLockedAt: now,
        metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: false } as object,
      },
    });
    return true;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") return false;
    throw error;
  }
}

async function acquireLockWithRetry(phone: string): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      if (await acquireLock(phone)) return;
    } catch (error) {
      lastError = error;
    }
    await wait(LOCK_RETRY_MS);
  }

  const cause = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Atendimento ocupado por mais de ${LOCK_WAIT_MS / 1000}s${cause}`);
}

async function releaseLock(phone: string): Promise<void> {
  try {
    await prisma.whatsAppSession.update({
      where: { phone: normalizePhone(phone) },
      data: { processingLockedAt: null },
    });
  } catch (error) {
    console.error("[WhatsApp Queue] Não foi possível liberar o lock:", error);
  }
}

async function processSerialized(
  msg: IncomingPayload,
  handler: (payload: IncomingPayload) => Promise<void>
) {
  await acquireLockWithRetry(msg.phone);
  try {
    await handler(msg);
  } finally {
    await releaseLock(msg.phone);
  }
}

/**
 * Processa todas as mensagens em ordem, sem atraso artificial e sem descartar
 * entradas concorrentes. O lock local ordena a instância atual e o lock no
 * banco coordena instâncias serverless diferentes.
 */
export function enqueueWhatsAppMessage(
  msg: IncomingPayload,
  handler: (payload: IncomingPayload) => Promise<void>,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<void> {
  const key = normalizePhone(msg.phone);
  const previous = localChains.get(key) ?? Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => processSerialized(msg, handler));

  localChains.set(key, task);
  void task.finally(() => {
    if (localChains.get(key) === task) localChains.delete(key);
  }).catch(() => undefined);

  waitUntil?.(task);
  return task;
}
