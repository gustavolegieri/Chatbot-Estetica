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

export function setProcessing(phone: string, value: boolean) {
  const key = normalizePhone(phone);
  if (value) processing.add(key);
  else processing.delete(key);
}

/**
 * Agrupa mensagens rápidas em uma só (anti-flood).
 * Responde uma única vez após ~2,8s sem novas mensagens.
 */
export function enqueueWhatsAppMessage(
  msg: IncomingPayload,
  handler: (merged: IncomingPayload) => Promise<void>
) {
  const key = normalizePhone(msg.phone);
  const existing = pending.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.texts.push(msg.text);
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
      timer: setTimeout(() => {}, 0),
    });
  }

  const entry = pending.get(key)!;
  entry.timer = setTimeout(async () => {
    pending.delete(key);
    if (processing.has(key)) return;

    const mergedText = entry.texts.join(" ").trim();
    if (!mergedText && !entry.buttonId && !entry.listId) return;

    processing.add(key);
    try {
      await handler({
        phone: entry.phone,
        text: mergedText || entry.buttonId || entry.listId || "",
        pushName: entry.pushName,
        buttonId: entry.buttonId,
        listId: entry.listId,
      });
    } finally {
      processing.delete(key);
    }
  }, DEBOUNCE_MS);
}
