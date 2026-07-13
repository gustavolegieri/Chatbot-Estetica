/**
 * Camada de envio WhatsApp — WasenderAPI
 * Substitui a Evolution API auto-hospedada.
 *
 * Variáveis de ambiente necessárias:
 *   WASENDER_API_KEY   → chave Bearer da sessão (painel WasenderAPI)
 *
 * Variáveis que podem ser removidas do .env:
 *   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
 */

import { MessageDirection, MessageSender } from "./message-enums";
import { phoneToWhatsApp } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { getMessageLogContext } from "./whatsapp-message-context";
import { logWhatsAppMessage } from "./whatsapp-message-log";

const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

interface SendTextParams {
  number: string;
  text: string;
  skipBotLog?: boolean;
  sender?: "BOT" | "ADMIN";
  flowStage?: string;
}

interface SendMediaParams {
  number: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
  mediaType?: "image" | "video" | "document";
}

interface ButtonOption {
  id: string;
  displayText: string;
}

interface SendButtonsParams {
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: ButtonOption[];
}

function getApiKey(): string | null {
  return process.env.WASENDER_API_KEY ?? null;
}

/**
 * Converte um caminho relativo (ex: /uploads/foto.jpg) em URL pública absoluta,
 * já que a WasenderAPI exige uma URL acessível externamente para envio de mídia.
 */
function toAbsoluteMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;

  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!base) {
    console.warn(
      "[WasenderAPI] NEXT_PUBLIC_APP_URL não configurada — envio de mídia relativa pode falhar:",
      url
    );
    return url;
  }

  const normalizedBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  return `${normalizedBase}${url.startsWith("/") ? url : `/${url}`}`;
}


async function wasenderFetch(body: object, attempt = 1): Promise<unknown> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("[WasenderAPI] ❌ Não configurada - mensagem simulada:", body);
    console.warn("[WasenderAPI] ⚠️ Configure WASENDER_API_KEY no .env");
    return { simulated: true };
  }

  console.log("[WasenderAPI] 📤 Enviando mensagem para WasenderAPI:", body);
  console.log("[WasenderAPI] 🔗 URL da API:", WASENDER_BASE);
  console.log("[WasenderAPI] 🔑 API Key configurada:", apiKey ? "SIM" : "NÃO");

  const response = await fetch(`${WASENDER_BASE}/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  console.log("[WasenderAPI] 📊 Status da resposta:", response.status, response.statusText);

  if (response.status === 429 && attempt <= 3) {
    let waitMs = 62_000;
    try {
      const json = await response.clone().json() as { retry_after?: number };
      if (json.retry_after) waitMs = (json.retry_after + 2) * 1000;
    } catch { /* ignora */ }
    console.warn(`[WasenderAPI] ⏳ Rate limit — aguardando ${waitMs / 1000}s (tentativa ${attempt}/3)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return wasenderFetch(body, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("[WasenderAPI] ❌ Erro na API:", response.status, "-", text);
    throw new Error(`WasenderAPI error: ${response.status} - ${text}`);
  }

  const result = await response.json();
  console.log("[WasenderAPI] ✅ Resposta da API:", result);
  return result;
}

/** Envia mensagem de texto simples */
export async function sendText({
  number,
  text,
  skipBotLog,
  sender = "BOT",
  flowStage,
}: SendTextParams) {
  console.log("[WasenderAPI] 📱 sendText chamado com:", { number, text: text.substring(0, 50) + "...", flowStage });

  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] ⛔ Envio bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  const whatsappNumber = phoneToWhatsApp(number);
  console.log("[WasenderAPI] 📲 Número formatado para WhatsApp:", whatsappNumber);

  const result = await wasenderFetch({
    to: whatsappNumber,
    text,
  });

  if (!skipBotLog) {
    const ctx = getMessageLogContext();
    const msgSender: MessageSender = sender === "ADMIN" ? MessageSender.ADMIN : MessageSender.BOT;
    await logWhatsAppMessage({
      phone: number,
      sessionId: ctx?.sessionId,
      clientId: ctx?.clientId,
      direction: MessageDirection.OUTBOUND,
      sender: msgSender,
      body: text,
      flowStage: flowStage ?? ctx?.getStage(),
    }).catch((err) => console.error("[WhatsApp Log] outbound:", err));
  }

  return result;
}

/**
 * Resolve caminho relativo de mídia para URL absoluta pública.
 * Usa NEXT_PUBLIC_APP_URL ou VERCEL_URL como base.
 * Data URLs (base64) são retornadas como estão.
 */
function resolveMediaUrl(url: string): string {
  // Se já for data URL (base64), retorna como está
  if (/^data:/i.test(url)) return url;
  
  // Se já for URL absoluta (http/https), retorna como está
  if (/^https?:\/\//i.test(url)) return url;
  
  // Converte URL relativa para absoluta
  return toAbsoluteMediaUrl(url);
}

/**
 * Envia mídia (imagem/vídeo/documento) via WhatsApp usando WasenderAPI.
 * A API aceita URLs públicas de mídia — caminhos relativos são convertidos automaticamente.
 */
export async function sendMedia({
  number,
  mediaUrl,
  caption,
  filename,
  mediaType = "image",
}: SendMediaParams) {
  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] Envio de mídia bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  const absoluteUrl = resolveMediaUrl(mediaUrl);

  const payload: Record<string, any> = {
    to: phoneToWhatsApp(number),
    text: caption,
  };

  if (mediaType === "image") {
    payload.imageUrl = absoluteUrl;
  } else if (mediaType === "video") {
    payload.videoUrl = absoluteUrl;
  } else {
    payload.documentUrl = absoluteUrl;
  }

  return wasenderFetch(payload);
}

/**
 * Envia botões interativos como texto numerado (fallback).
 */
export async function sendButtons({
  number,
  title,
  description,
  footer,
  buttons,
}: SendButtonsParams) {
  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] Envio bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  const lines: string[] = [];
  if (title) lines.push(`*${title}*`);
  if (description) lines.push(description);
  lines.push("");
  buttons.forEach((b, i) => lines.push(`${i + 1} — ${b.displayText}`));
  if (footer) lines.push("", `_${footer}_`);

  return wasenderFetch({
    to: phoneToWhatsApp(number),
    text: lines.join("\n"),
  });
}

/** Envia lista de opções como texto numerado */
export async function sendList({
  number,
  title,
  description,
  sections,
}: {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}) {
  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] Envio bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  const lines: string[] = [];
  if (title) lines.push(`*${title}*`);
  if (description) lines.push(description);

  for (const section of sections) {
    lines.push("", `*${section.title}*`);
    for (const row of section.rows) {
      lines.push(`• ${row.title}${row.description ? ` — ${row.description}` : ""}`);
    }
  }

  return wasenderFetch({
    to: phoneToWhatsApp(number),
    text: lines.join("\n"),
  });
}