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

import { phoneToWhatsApp } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";

const WASENDER_BASE = "https://wasenderapi.com/api";

interface SendTextParams {
  number: string;
  text: string;
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

async function wasenderFetch(body: object, attempt = 1): Promise<unknown> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("[WasenderAPI] Não configurada - mensagem simulada:", body);
    return { simulated: true };
  }

  const response = await fetch(`${WASENDER_BASE}/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429 && attempt <= 3) {
    let waitMs = 62_000; // fallback: 62s
    try {
      const json = await response.clone().json() as { retry_after?: number };
      if (json.retry_after) waitMs = (json.retry_after + 2) * 1000;
    } catch { /* ignora erro de parse */ }

    console.warn(`[WasenderAPI] Rate limit — aguardando ${waitMs / 1000}s (tentativa ${attempt}/3)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return wasenderFetch(body, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WasenderAPI error: ${response.status} - ${text}`);
  }

  return response.json();
}

/** Envia mensagem de texto simples */
export async function sendText({ number, text }: SendTextParams) {
  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] Envio bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  return wasenderFetch({
    to: phoneToWhatsApp(number),
    text,
  });
}

/**
 * Envia botões interativos.
 *
 * ATENÇÃO: A WasenderAPI não possui endpoint nativo de botões igual à
 * Evolution API. Como fallback, os botões são enviados como lista
 * numerada em texto simples — funciona em qualquer versão do WhatsApp.
 *
 * Se no futuro a WasenderAPI suportar botões nativos, basta trocar o
 * corpo do wasenderFetch abaixo.
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