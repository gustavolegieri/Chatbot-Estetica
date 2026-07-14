import { normalizePhone } from "./utils";

const DEBOUNCE_MS = 2800;

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

const pending = new Map<string, PendingMessage>();
const processing = new Set<string>();

export function isProcessing(phone: string) {
  return processing.has(normalizePhone(phone));
}

const PROCESSING_TIMEOUT_MS = 30_000; // segurança: limpa chave travada após 30s

// Evita que respostas “travem” por causa de erro/timeout: se houver processamento ativo,
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
 * Responde uma única vez após ~2,8s sem novas mensagens.
 * Usa a última mensagem recebida em vez de juntar com espaço.
 */
export function enqueueWhatsAppMessage(
  msg: IncomingPayload,
  handler: (merged: IncomingPayload) => Promise<void>
) {
  console.log("[Debounce] 📨 Mensagem enfileirada:", { phone: msg.phone, text: msg.text });
  const key = normalizePhone(msg.phone);
  const existing = pending.get(key);

  if (existing) {
    console.log("[Debounce] 🔄 Substituindo mensagem existente");
    clearTimeout(existing.timer);
    // Substitui o texto anterior pelo novo (em vez de acumular)
    existing.texts = [msg.text];
    if (msg.pushName) existing.pushName = msg.pushName;
    if (msg.buttonId) existing.buttonId = msg.buttonId;
    if (msg.listId) existing.listId = msg.listId;
  } else {
    console.log("[Debounce] ➕ Nova mensagem na fila");
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
  entry.timer = setTimeout(async () => {
    console.log("[Debounce] ⏰ Timer disparado, processando mensagem");
    pending.delete(key);
    if (processing.has(key)) {
      console.log("[Debounce] ⛔ Já processando este número, ignorando");
      return;
    }

    // Usa apenas a última mensagem recebida
    const mergedText = entry.texts[entry.texts.length - 1]?.trim() || "";
    if (!mergedText && !entry.buttonId && !entry.listId) {
      console.log("[Debounce] ⛔ Mensagem vazia, ignorando");
      return;
    }

    console.log("[Debounce] 🚀 Iniciando handler com:", { phone: entry.phone, text: mergedText });
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
      console.log("[Debounce] ✅ Handler concluído com sucesso");
    } finally {
      clearTimeout(safetyTimer);
      processing.delete(key);
    }
  }, DEBOUNCE_MS);
}