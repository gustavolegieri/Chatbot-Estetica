/**
 * Camada de envio WhatsApp — WasenderAPI
 * Substitui a Evolution API auto-hospedada.
 *
 * Variáveis de ambiente necessárias:
 *   WASENDER_API_KEY   → chave Bearer da sessão (painel WasenderAPI)
 *
 * Variáveis que podem ser removidas do .env:
 *   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
 *
 * CORREÇÃO (fix E.164): a WasenderAPI exige o número no formato E.164
 * (ex: "+5511944400696"), com o "+" na frente. A função phoneToWhatsApp()
 * em utils.ts devolve só os dígitos (ex: "5511944400696"), formato que
 * era usado para montar JIDs no padrão Evolution API/Baileys. Por isso,
 * toda chamada que monta o campo "to" do payload agora prefixa "+"
 * explicitamente, sem alterar phoneToWhatsApp() (que pode ser usado em
 * outros lugares do código nesse formato sem "+").
 */

import { MessageDirection, MessageSender } from "./message-enums";
import { phoneToWhatsApp } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { getMessageLogContext } from "./whatsapp-message-context";
import { logWhatsAppMessage } from "./whatsapp-message-log";
import { prisma } from "./prisma";
import crypto from "crypto";

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

/**
 * Formata o número para o padrão E.164 exigido pela WasenderAPI ("to": "+5511999998888").
 * phoneToWhatsApp() devolve só dígitos (ex: "5511944400696"); aqui garantimos o "+" na frente.
 */
function toE164(number: string): string {
  const digits = phoneToWhatsApp(number);
  return digits.startsWith("+") ? digits : `+${digits}`;
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


// Fila persistente no banco para mensagens que falharam por rate limit
// Substitui o Map em memória que não funciona em serverless
// Processamento é feito pelo cron job em /api/cron/process-message-queue
async function addToQueue(phone: string, body: object, isDailyLimit: boolean = false) {
  try {
    const phoneDigits = phone.replace(/\D/g, "");
    const scheduledFor = new Date(Date.now() + 35000); // 35 segundos no futuro
    
    // Gerar hash do conteúdo para deduplicação
    const bodyStr = JSON.stringify(body);
    const bodyHash = crypto.createHash("md5").update(`${phoneDigits}:${bodyStr}`).digest("hex");
    
    // Verificar deduplicação: mensagem com mesmo hash já está na fila?
    const existing = await prisma.outboundMessageQueue.findFirst({
      where: {
        bodyHash,
        processedAt: null,
      }
    });
    
    if (existing) {
      console.log("[WasenderAPI] ⚠️ Mensagem duplicada detectada (hash:", bodyHash, ") - não enfileirando novamente");
      return;
    }
    
    // Serializar o body como JSONValue para garantir compatibilidade com Prisma Json
    const bodyJson = JSON.parse(JSON.stringify(body));
    
    await prisma.outboundMessageQueue.create({
      data: {
        phone: phoneDigits,
        body: bodyJson,
        bodyHash,
        attempts: 0,
        maxAttempts: 3,
        scheduledFor,
        isDailyLimit,
      }
    });
    
    console.log("[WasenderAPI] 📥 Mensagem adicionada à fila persistente - telefone:", phone, "hash:", bodyHash, "agendada para:", scheduledFor);
  } catch (error) {
    console.error("[WasenderAPI] ❌ Erro ao adicionar mensagem à fila:", error);
  }
}

export async function wasenderFetch(body: object, attempt = 1): Promise<unknown> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("[WasenderAPI] ❌ Não configurada - mensagem simulada:", body);
    console.warn("[WasenderAPI] ⚠️ Configure WASENDER_API_KEY no .env");
    return { simulated: true };
  }

  // Log detalhado do payload enviado
  const phoneField = (body as any).to;
  const textField = (body as any).text;
  console.log("[WasenderAPI] 📤 Enviando mensagem:", {
    to: phoneField,
    textLength: textField?.length || 0,
    textPreview: textField?.substring(0, 50) || "",
    hasMedia: !!(body as any).imageUrl || !!(body as any).videoUrl || !!(body as any).documentUrl
  });

  const response = await fetch(`${WASENDER_BASE}/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429 && attempt <= 3) {
    let waitMs = 30_000; // Reduzido de 62s para 30s para alta disponibilidade
    let isDailyLimit = false;
    
    try {
      const json = await response.clone().json() as { retry_after?: number; message?: string };
      if (json.retry_after) waitMs = Math.min(json.retry_after * 1000, 30_000); // Max 30s
      
      // Verificar se é limite diário (não deve enfileirar)
      if (json.message?.toLowerCase().includes("daily") || json.message?.toLowerCase().includes("trial cap")) {
        isDailyLimit = true;
      }
    } catch { /* ignora */ }
    
    if (isDailyLimit) {
      console.error("[WasenderAPI] ❌ Limite diário da API atingido - mensagens não serão enfileiradas");
      console.error("[WasenderAPI] 💡 Faça upgrade para plano pago ou aguarde o reset diário");
      return { error: true, status: 429, message: "Limite diário da API atingido" };
    }
    
    console.warn(`[WasenderAPI] ⏳ Rate limit — aguardando ${waitMs / 1000}s (tentativa ${attempt}/3)`);
    
    // Adicionar à fila persistente em vez de bloquear
    const phone = (body as any).to;
    if (phone) {
      await addToQueue(phone, body, false);
      console.log("[WasenderAPI] 📤 Mensagem adicionada à fila persistente devido a rate limit");
      // Não processamos automaticamente - será processado por cron job ou rota separada
      return { queued: true, reason: "rate_limit" };
    }
    
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return wasenderFetch(body, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error("[WasenderAPI] ❌ Erro na API:", {
      status: response.status,
      statusText: response.statusText,
      responseText: text.substring(0, 200),
      payload: { to: phoneField, textLength: textField?.length }
    });
    
    // Verificar se é limite diário antes de tratar como erro temporário
    if (response.status === 429) {
      try {
        const json = await response.clone().json();
        if (json.message?.toLowerCase().includes("daily") || json.message?.toLowerCase().includes("trial cap")) {
          console.error("[WasenderAPI] ❌ Limite diário atingido - não é erro temporário");
          return { error: true, status: 429, message: json.message, isDailyLimit: true };
        }
      } catch { /* ignora */ }
    }
    
    // Não lançar erro em casos de rate limit temporário ou erro temporário
    if (response.status >= 500 || response.status === 429) {
      console.warn("[WasenderAPI] ⚠️ Erro temporário, continuando fluxo");
      return { error: true, status: response.status, message: text };
    }
    throw new Error(`WasenderAPI error: ${response.status} - ${text}`);
  }

  const result = await response.json();
  console.log("[WasenderAPI] ✅ Resposta da API:", {
    status: "success",
    to: phoneField,
    result: result
  });
  
  // Não processamos a fila automaticamente - será processado por cron job ou rota separada
  // Isso evita setTimeout em serverless que não tem garantia de execução
  
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
  if (!isValidPrivateRecipient(number)) {
    console.warn("[WasenderAPI] ⛔ Envio bloqueado (não é chat privado):", number);
    return { blocked: true, reason: "not_private_recipient" };
  }

  const whatsappNumber = toE164(number);

  try {
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
  } catch (err) {
    console.error("[WasenderAPI] ❌ Erro ao enviar mensagem, mas continuando fluxo:", err);
    // Não lançar erro para permitir que o fluxo continue
    return { error: true, message: "Erro ao enviar mensagem, fluxo continuou" };
  }
}

/**
 * Resolve caminho relativo de mídia para URL absoluta pública.
 * Usa NEXT_PUBLIC_APP_URL ou VERCEL_URL como base.
 * Data URLs (base64) podem não ser suportadas pela WASender API - mantém compatibilidade.
 */
function resolveMediaUrl(url: string): string | null {
  // Se já for data URL (base64), tenta usar (pode funcionar no plano pago)
  if (/^data:/i.test(url)) {
    console.log("[WasenderAPI] Data URL detectada - tentando envio (pode não funcionar em plano gratuito)");
    return url; // Tenta enviar mesmo assim (pode funcionar no plano pago)
  }
  
  // Se já for URL absoluta (http/https), retorna como está
  if (/^https?:\/\//i.test(url)) return url;
  
  // Converte URL relativa para absoluta
  return toAbsoluteMediaUrl(url);
}

/**
 * Envia mídia (imagem/vídeo/documento) via WhatsApp usando WasenderAPI.
 * A API aceita URLs públicas de mídia — caminhos relativos são convertidos automaticamente.
 * Data URLs podem funcionar no plano pago, mas não no gratuito.
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

  // Se resolveMediaUrl retornou null, retorna erro
  if (!absoluteUrl) {
    console.warn("[WasenderAPI] URL de mídia inválida");
    return { error: true, message: "URL de mídia inválida" };
  }

  const payload: Record<string, any> = {
    to: toE164(number),
    text: caption,
  };

  if (mediaType === "image") {
    payload.imageUrl = absoluteUrl;
  } else if (mediaType === "video") {
    payload.videoUrl = absoluteUrl;
  } else {
    payload.documentUrl = absoluteUrl;
  }

  try {
    return await wasenderFetch(payload);
  } catch (err) {
    console.error("[WasenderAPI] ❌ Erro ao enviar mídia, mas continuando fluxo:", err);
    return { error: true, message: "Erro ao enviar mídia, fluxo continuou" };
  }
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

  try {
    return await wasenderFetch({
      to: toE164(number),
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("[WasenderAPI] ❌ Erro ao enviar botões, mas continuando fluxo:", err);
    return { error: true, message: "Erro ao enviar botões, fluxo continuou" };
  }
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

  try {
    return await wasenderFetch({
      to: toE164(number),
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("[WasenderAPI] ❌ Erro ao enviar lista, mas continuando fluxo:", err);
    return { error: true, message: "Erro ao enviar lista, fluxo continuou" };
  }
}