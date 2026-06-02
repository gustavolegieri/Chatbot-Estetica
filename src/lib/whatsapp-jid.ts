import { normalizePhone } from "./utils";

/** JIDs que não são conversa 1:1 com pessoa */
const GROUP_SUFFIXES = ["@g.us", "@broadcast"];
const NON_PRIVATE_SUFFIXES = ["@newsletter", "@lid"];

/**
 * Aceita apenas chat privado com usuário (@s.whatsapp.net ou @c.us).
 * Ignora grupos, comunidades, listas de transmissão e status.
 */
export function isPrivateUserChat(remoteJid: string): boolean {
  const jid = remoteJid.toLowerCase().trim();
  if (!jid || jid.includes(":")) return false;

  for (const suffix of GROUP_SUFFIXES) {
    if (jid.endsWith(suffix) || jid.includes(suffix)) return false;
  }
  for (const suffix of NON_PRIVATE_SUFFIXES) {
    if (jid.includes(suffix)) return false;
  }

  if (jid === "status@broadcast") return false;

  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us");
}

export function isGroupWebhookPayload(data: {
  key?: { remoteJid?: string; participant?: string };
  isGroup?: boolean;
}): boolean {
  if (data.isGroup === true) return true;

  const remoteJid = data.key?.remoteJid?.toLowerCase() ?? "";
  if (remoteJid.includes("@g.us")) return true;

  // Mensagem em grupo: remoteJid do grupo + participant do remetente
  if (data.key?.participant && remoteJid && !isPrivateUserChat(remoteJid)) {
    return true;
  }

  return false;
}

/** Extrai telefone apenas de JID privado válido */
export function phoneFromPrivateJid(remoteJid: string): string | null {
  if (!isPrivateUserChat(remoteJid)) return null;
  const userPart = remoteJid.split("@")[0];
  const digits = normalizePhone(userPart);
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Bloqueia envio acidental para ID de grupo (números muito longos / sufixo) */
export function isValidPrivateRecipient(number: string): boolean {
  const raw = number.trim().toLowerCase();
  if (GROUP_SUFFIXES.some((s) => raw.includes(s)) || raw.includes("@g.us")) {
    return false;
  }
  const digits = normalizePhone(number);
  if (digits.length < 10 || digits.length > 15) return false;
  // IDs de grupo costumam ter 15+ dígitos sem ser telefone válido
  if (digits.length >= 16) return false;
  return true;
}
