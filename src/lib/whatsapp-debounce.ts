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

  try {
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

    if (result.count === 0) {
      console.log("[Lock] Mensagem ignorada — outra instância já está processando", normalized);
      return false;
    }

    console.log("[Lock] Lock adquirido com sucesso para", normalized);
    return true;
  } catch (error) {
    console.error("[Lock] Erro ao adquirir lock:", error);
    // Em caso de erro, permitimos o processamento para não bloquear
    return true;
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
) {
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

  // Sempre cancela o timer anterior (seja o dummy ou um real) antes de definir o novo
  const entry = pending.get(key)!;
  clearTimeout(entry.timer);
  
  // Função que processa a mensagem após o debounce
  const processMessage = async () => {
    pending.delete(key);

    // Usa apenas a última mensagem recebida
    const mergedText = entry.texts[entry.texts.length - 1]?.trim() || "";
    if (!mergedText && !entry.buttonId && !entry.listId) {
      return;
    }

    // Tenta adquirir lock distribuído antes de processar
    const lockAcquired = await acquireLock(entry.phone);
    if (!lockAcquired) {
      return; // Outra instância já está processando
    }

    try {
      await handler({
        phone: entry.phone,
        text: mergedText || entry.buttonId || entry.listId || "",
        pushName: entry.pushName,
        buttonId: entry.buttonId,
        listId: entry.listId,
      });
    } finally {
      // Sempre libera o lock, mesmo em caso de erro
      await releaseLock(entry.phone);
    }
  };
  
  // Se waitUntil estiver disponível (Vercel), usa para garantir execução após resposta
  if (waitUntil) {
    const promise = new Promise<void>((resolve) => {
      entry.timer = setTimeout(async () => {
        await processMessage();
        resolve();
      }, DEBOUNCE_MS);
    });
    waitUntil(promise);
  } else {
    // Sem waitUntil: cria timer normal (ambiente local/dev)
    entry.timer = setTimeout(processMessage, DEBOUNCE_MS);
  }
}
