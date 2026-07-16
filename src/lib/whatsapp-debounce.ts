import { normalizePhone } from "./utils";

// Reduzido para 500ms para plano gratuito WASender API (1 msg/minuto)
const DEBOUNCE_MS = 500;

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
const processing = new Set<string>();

export function isProcessing(phone: string) {
  return processing.has(normalizePhone(phone));
}

const PROCESSING_TIMEOUT_MS = 15_000; // segurança: limpa chave travada após 15s (reduzido para alto volume)

// Evita que respostas "travem" por causa de erro/timeout: se houver processamento ativo,
// não enfileire novas mensagens do mesmo phone até liberar (reduz loops e repetição).

export function setProcessing(phone: string, value: boolean) {
  const key = normalizePhone(phone);
  if (value) {
    processing.add(key);
    // Garante que a chave seja removida mesmo se o finally não executar (cold start / crash)
    setTimeout(() => processing.delete(key), PROCESSING_TIMEOUT_MS);
  } else {
    processing.delete(key);
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
      timer: setTimeout(() => { /* substituído abaixo */ }, 0),
    });
  }

  // Sempre cancela o timer anterior (seja o dummy ou um real) antes de definir o novo
  const entry = pending.get(key)!;
  clearTimeout(entry.timer);
  
  // Função que processa a mensagem após o debounce
  const processMessage = async () => {
    pending.delete(key);
    if (processing.has(key)) {
      return;
    }

    // Usa apenas a última mensagem recebida
    const mergedText = entry.texts[entry.texts.length - 1]?.trim() || "";
    if (!mergedText && !entry.buttonId && !entry.listId) {
      return;
    }

    processing.add(key);
    // Segurança: remove a chave após 30s caso o finally não execute (Vercel cold start)
    const safetyTimer = setTimeout(() => processing.delete(key), PROCESSING_TIMEOUT_MS);
    try {
      await handler({
        phone: entry.phone,
        text: mergedText || entry.buttonId || entry.listId || "",
        pushName: entry.pushName,
        buttonId: entry.buttonId,
        listId: entry.listId,
      });
    } finally {
      clearTimeout(safetyTimer);
      processing.delete(key);
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
