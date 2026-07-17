import { normalizePhone } from "./utils";
import { prisma } from "./prisma";

// Reduzido para 500ms para plano gratuito WASender API (1 msg/minuto)
const DEBOUNCE_MS = 500;
const LOCK_TIMEOUT_MS = 15_000;

interface PendingMessage {
  phone: string;
  texts: string[];
  pushName?: string;
  buttonId?: string;
  listId?: string;
  timer: ReturnType<typeof setTimeout>;
}

interface IncomingPayload {
  phone: string;
  text: string;
  pushName?: string;
  buttonId?: string;
  listId?: string;
}

// Estado em memória para debounce (aceitável pois é apenas para agrupar mensagens rápidas)
const pending = new Map<string, PendingMessage>();

/**
 * Tenta adquirir lock distribuído no banco para evitar processamento paralelo
 * entre diferentes instâncias serverless.
 * 
 * @returns true se o lock foi adquirido, false se já estava em uso
 */
async function acquireLock(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  // 1. Tenta adquirir lock atomicamente numa sessão já existente
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

  if (result.count > 0) {
    console.log("[Lock] Lock adquirido com sucesso para", normalized);
    return true; // conseguiu o lock numa sessão existente
  }

  // 2. count === 0: ou está locked por outra instância, ou a sessão ainda não existe
  const exists = await prisma.whatsAppSession.findUnique({
    where: { phone: normalized },
    select: { phone: true },
  });

  if (exists) {
    console.log("[Lock] Mensagem ignorada — outra instância já está processando", normalized);
    return false; // estava locked de verdade
  }

  // 3. Telefone novo: tenta criar, mas trata corrida contra outro create concorrente
  try {
    await prisma.whatsAppSession.create({
      data: {
        phone: normalized,
        processingLockedAt: now,
        metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: false } as object,
      },
    });
    console.log("[Lock] Lock adquirido com sucesso (nova sessão) para", normalized);
    return true;
  } catch (error: any) {
    if (error.code === "P2002") {
      // outra instância criou a sessão entre o findUnique e o create — perdeu a corrida
      console.log("[Lock] Mensagem ignorada — outra instância criou a sessão primeiro", normalized);
      return false;
    }
    console.error("[Lock] Erro ao criar nova sessão:", error);
    return false;
  }
}

/**
 * Libera o lock distribuído no banco.
 */
async function releaseLock(phone: string): Promise<void> {
  const normalized = normalizePhone(phone);

  try {
    await prisma.whatsAppSession.update({
      where: { phone: normalized },
      data: { processingLockedAt: null },
    });
    console.log("[Lock] Lock liberado para", normalized);
  } catch (error) {
    console.error("[Lock] Erro ao liberar lock:", error);
  }
}

/**
 * Agrupa mensagens rápidas em uma só (anti-flood).
 * Responde uma única vez após 500ms sem novas mensagens.
 * Usa a última mensagem recebida em vez de juntar com espaço.
 * 
 * SERVERLESS COMPATIBLE: Usa waitUntil() para garantir execução do timer
 * mesmo após a resposta HTTP ser enviada (Vercel específico).
 */
export function enqueueWhatsAppMessage(
  msg: IncomingPayload,
  handler: (merged: IncomingPayload) => Promise<void>,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<void> {
  const key = normalizePhone(msg.phone);
  const existing = pending.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    // Substitui o texto anterior pelo novo (em vez de acumular)
    existing.texts = [msg.text];
    if (msg.pushName) existing.pushName = msg.pushName;
    if (msg.buttonId) existing.buttonId = msg.buttonId;
    if (msg.listId) existing.listId = msg.listId;
  } else {
    pending.set(key, {
      phone: msg.phone,
      texts: [msg.text],
      pushName: msg.pushName,
      buttonId: msg.buttonId,
      listId: msg.listId,
      timer: setTimeout(() => { /* substituído abaixo */ }, DEBOUNCE_MS),
    });
  }

  const entry = pending.get(key)!;
  clearTimeout(entry.timer);

  const completionPromise = new Promise<void>(async (resolve, reject) => {
    const processMessage = async () => {
      pending.delete(key);

      const mergedText = entry.texts[entry.texts.length - 1]?.trim() || "";
      if (!mergedText && !entry.buttonId && !entry.listId) {
        resolve();
        return;
      }

      const lockAcquired = await acquireLock(entry.phone);
      if (!lockAcquired) {
        resolve();
        return;
      }

      try {
        await handler({
          phone: entry.phone,
          text: mergedText || entry.buttonId || entry.listId || "",
          pushName: entry.pushName,
          buttonId: entry.buttonId,
          listId: entry.listId,
        });
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        await releaseLock(entry.phone);
      }
    };

    entry.timer = setTimeout(() => {
      processMessage().catch(reject);
    }, DEBOUNCE_MS);
  });

  if (waitUntil) {
    waitUntil(completionPromise);
  }

  return completionPromise;
}
