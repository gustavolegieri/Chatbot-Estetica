/**
 * Webhook WasenderAPI → Next.js
 * Arquivo: src/app/api/whatsapp/webhook/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import { isGroupWebhookPayload, phoneFromPrivateJid } from "@/lib/whatsapp-jid";

/** Verifica assinatura enviada pela WasenderAPI no header X-Webhook-Signature */
function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.WASENDER_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = req.headers.get("x-webhook-signature");
  if (!signature) return false;

  return signature === secret;
}

/**
 * Extrai o texto da mensagem do payload WasenderAPI.
 * O campo unificado é `messageBody`; fallback para campos legados.
 */
function extractText(data: Record<string, unknown>): string {
  if (typeof data.messageBody === "string") return data.messageBody;

  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return "";

  return (
    (msg.conversation as string) ||
    ((msg.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ""
  );
}

/** Extrai buttonId / listId de respostas interativas */
function extractInteractive(data: Record<string, unknown>) {
  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return {};

  const btnReply = msg.buttonsResponseMessage as Record<string, unknown> | undefined;
  if (btnReply) {
    return { buttonId: btnReply.selectedButtonId as string };
  }

  const listReply = msg.listResponseMessage as Record<string, unknown> | undefined;
  if (listReply) {
    const singleSelect = listReply.singleSelectReply as Record<string, unknown> | undefined;
    return { listId: singleSelect?.selectedRowId as string | undefined };
  }

  return {};
}

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // LOG TEMPORÁRIO — remove depois de funcionar
  console.log("[Webhook] payload recebido:", rawBody.slice(0, 600));

  if (!verifySignature(req, rawBody)) {
    console.warn("[Webhook] assinatura inválida");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event as string | undefined;
  console.log("[Webhook] event:", event);

  // Aceita todos os eventos de mensagem recebida
  const isMessageEvent =
    event === "messages.received" ||
    event === "messages.upsert" ||
    event === "messages-personal.received" ||
    !event;

  if (!isMessageEvent) {
    console.log("[Webhook] evento ignorado:", event);
    return NextResponse.json({ ok: true });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;

  // Ignora mensagens enviadas pelo próprio bot
  const key = data.key as Record<string, unknown> | undefined;
  if (key?.fromMe === true) {
    console.log("[Webhook] ignorado: fromMe");
    return NextResponse.json({ ok: true });
  }

  // Ignora grupos
  if (isGroupWebhookPayload({ key, isGroup: data.isGroup as boolean })) {
    console.log("[Webhook] ignorado: grupo");
    return NextResponse.json({ ok: true });
  }

  const remoteJid = (key?.remoteJid ?? data.from ?? "") as string;
  console.log("[Webhook] remoteJid:", remoteJid);

  const phone = phoneFromPrivateJid(remoteJid);
  if (!phone) {
    console.warn("[Webhook] phone inválido para jid:", remoteJid);
    return NextResponse.json({ ok: true });
  }

  const text = extractText(data);
  const { buttonId, listId } = extractInteractive(data);
  const pushName = (data.pushName ?? data.notifyName ?? "") as string;

  console.log("[Webhook] processando — phone:", phone, "text:", text);

  const processingPromise = processWhatsAppMessage({
    phone,
    text: text || buttonId || listId || "",
    buttonId,
    listId,
    pushName: pushName || undefined,
  });

  processingPromise.catch((err) => {
    console.error("[Webhook] Erro ao processar mensagem:", err);
  });

  return NextResponse.json({ ok: true });
}