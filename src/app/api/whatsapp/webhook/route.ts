/**
 * Webhook WasenderAPI → Next.js
 * Arquivo: src/app/api/webhook/whatsapp/route.ts
 *
 * Substitui o webhook da Evolution API.
 *
 * Variável de ambiente necessária:
 *   WASENDER_WEBHOOK_SECRET  → segredo gerado no painel WasenderAPI
 *                              (sessão → configurações → webhook secret)
 */

import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import { isGroupWebhookPayload, phoneFromPrivateJid } from "@/lib/whatsapp-jid";

/** Verifica assinatura enviada pela WasenderAPI no header X-Webhook-Signature */
function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.WASENDER_WEBHOOK_SECRET;
  // Se não configurou o secret, passa (útil em dev)
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
    (msg.extendedTextMessage as Record<string, unknown>)?.text as string ||
    ""
  );
}

/** Extrai buttonId / listId de respostas interativas (se suportado no futuro) */
function extractInteractive(data: Record<string, unknown>) {
  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return {};

  // botão de resposta rápida
  const btnReply = msg.buttonsResponseMessage as Record<string, unknown> | undefined;
  if (btnReply) {
    return { buttonId: btnReply.selectedButtonId as string };
  }

  // item de lista
  const listReply = msg.listResponseMessage as Record<string, unknown> | undefined;
  if (listReply) {
    return { listId: listReply.singleSelectReply?.selectedRowId as string };
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

  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event as string | undefined;

  // Só processa mensagens recebidas (não as enviadas pelo bot)
  if (event !== "messages.received" && event !== "messages.upsert") {
    return NextResponse.json({ ok: true });
  }

  const data = (payload.data ?? payload) as Record<string, unknown>;

  // Ignora mensagens enviadas pelo próprio bot
  const key = data.key as Record<string, unknown> | undefined;
  if (key?.fromMe === true) {
    return NextResponse.json({ ok: true });
  }

  // Ignora grupos
  if (isGroupWebhookPayload({ key, isGroup: data.isGroup as boolean })) {
    return NextResponse.json({ ok: true });
  }

  const remoteJid = (key?.remoteJid ?? data.from ?? "") as string;
  const phone = phoneFromPrivateJid(remoteJid);
  if (!phone) {
    return NextResponse.json({ ok: true });
  }

  const text = extractText(data);
  const { buttonId, listId } = extractInteractive(data);
  const pushName = (data.pushName ?? data.notifyName ?? "") as string;

  // Responde 200 imediatamente antes de processar (boa prática)
  const processingPromise = processWhatsAppMessage({
    phone,
    text: text || buttonId || listId || "",
    buttonId,
    listId,
    pushName: pushName || undefined,
  });

  // Fire-and-forget com log de erro
  processingPromise.catch((err) => {
    console.error("[Webhook] Erro ao processar mensagem:", err);
  });

  return NextResponse.json({ ok: true });
}