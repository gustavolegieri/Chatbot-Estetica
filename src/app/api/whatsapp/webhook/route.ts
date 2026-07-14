
import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";

/** Verifica assinatura enviada pela WasenderAPI no header X-Webhook-Signature */
function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.WASENDER_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature = req.headers.get("x-webhook-signature");
  if (!signature) return false;
  return signature === secret;
}

/** Extrai o texto da mensagem */
function extractText(msg: Record<string, unknown>): string {
  if (typeof msg.messageBody === "string") return msg.messageBody;

  const message = msg.message as Record<string, unknown> | undefined;
  if (!message) return "";

  return (
    (message.conversation as string) ||
    ((message.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ""
  );
}

/** Extrai buttonId / listId de respostas interativas */
function extractInteractive(msg: Record<string, unknown>) {
  const message = msg.message as Record<string, unknown> | undefined;
  if (!message) return {};

  const btnReply = message.buttonsResponseMessage as Record<string, unknown> | undefined;
  if (btnReply) {
    return { buttonId: btnReply.selectedButtonId as string };
  }

  const listReply = message.listResponseMessage as Record<string, unknown> | undefined;
  if (listReply) {
    const singleSelect = listReply.singleSelectReply as Record<string, unknown> | undefined;
    return { listId: singleSelect?.selectedRowId as string | undefined };
  }

  return {};
}

/** Extrai número de telefone limpo de qualquer formato WasenderAPI */
function extractPhone(msgKey: Record<string, unknown>): string | null {
  const candidates = [
    msgKey.cleanedSenderPn,
    msgKey.senderPn,
    msgKey.remoteJid,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    if (candidate.includes("@g.us")) continue;
    if (candidate.includes("@broadcast")) continue;
    if (candidate.includes("@newsletter")) continue;
    if (candidate.includes("@lid") && !msgKey.cleanedSenderPn && !msgKey.senderPn) continue;

    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }

  return null;
}

// Cache simples para deduplicação de mensagens (24h TTL)
const processedMessageIds = new Map<string, number>();
const DEDUPLICATION_TTL = 24 * 60 * 60 * 1000; // 24 horas

function isMessageProcessed(messageId: string): boolean {
  const timestamp = processedMessageIds.get(messageId);
  if (!timestamp) return false;
  
  if (Date.now() - timestamp > DEDUPLICATION_TTL) {
    processedMessageIds.delete(messageId);
    return false;
  }
  
  return true;
}

function markMessageAsProcessed(messageId: string): void {
  processedMessageIds.set(messageId, Date.now());
  
  // Limpar entradas antigas periodicamente
  if (processedMessageIds.size > 10000) {
    const now = Date.now();
    for (const [id, timestamp] of processedMessageIds.entries()) {
      if (now - timestamp > DEDUPLICATION_TTL) {
        processedMessageIds.delete(id);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  console.log("[Webhook] 🚀🚀🚀 WEBHOOK POST RECEBIDO - INÍCIO ABSOLUTO 🚀🚀🚀");
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

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

  const isMessageEvent =
    event === "messages.received" ||
    event === "messages.upsert" ||
    event === "messages-personal.received" ||
    !event;

  if (!isMessageEvent) {
    return NextResponse.json({ ok: true });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return NextResponse.json({ ok: true });

  const msgRaw = data.messages ?? data;
  const msg = msgRaw as Record<string, unknown>;

  const msgKey = (msg.key ?? {}) as Record<string, unknown>;

  if (msgKey.fromMe === true) {
    return NextResponse.json({ ok: true });
  }

  const remoteJid = (msgKey.remoteJid ?? "") as string;
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    return NextResponse.json({ ok: true });
  }

  const phone = extractPhone(msgKey);
  if (!phone) {
    console.warn("[Webhook] phone inválido, key:", JSON.stringify(msgKey));
    return NextResponse.json({ ok: true });
  }

  // Verificar modo de teste
  const { prisma } = await import("@/lib/prisma");
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  
  console.log("[Webhook] Configurações de teste:", {
    testModeEnabled: settings?.testModeEnabled,
    testModePhone: settings?.testModePhone,
    phoneExtraido: phone
  });
  
  if (settings?.testModeEnabled) {
    const testPhone = settings.testModePhone?.replace(/\D/g, ""); // Remove não-dígitos
    const normalizedPhone = phone.replace(/\D/g, "");
    
    console.log("[Webhook] Comparação de modo de teste:", {
      testPhone,
      normalizedPhone,
      saoIguais: testPhone === normalizedPhone,
      testPhoneLength: testPhone?.length,
      normalizedPhoneLength: normalizedPhone.length
    });
    
    // Se não há telefone de teste configurado, ignora todas as mensagens em modo de teste
    if (!testPhone) {
      console.log("[Webhook] Modo de teste ativado mas nenhum telefone configurado - todas as mensagens serão ignoradas");
      return NextResponse.json({ ok: true });
    }
    
    if (normalizedPhone !== testPhone) {
      console.log("[Webhook] Modo de teste ativado - mensagem ignorada de telefone não autorizado:", phone, "(esperado:", testPhone + ")");
      return NextResponse.json({ ok: true });
    }
    
    console.log("[Webhook] Modo de teste - mensagem autorizada de telefone de teste:", phone);
  }

  // Deduplicação baseada em ID da mensagem
  const messageId = msgKey.id as string | undefined;
  if (messageId && isMessageProcessed(messageId)) {
    console.log("[Webhook] mensagem duplicada ignorada — messageId:", messageId);
    return NextResponse.json({ ok: true });
  }

  const text = extractText(msg);
  const { buttonId, listId } = extractInteractive(msg);
  const pushName = (msg.pushName ?? msg.notifyName ?? "") as string;

  console.log("[Webhook] processando — phone:", phone, "text:", text, "messageId:", messageId, "testModeEnabled:", settings?.testModeEnabled);

  // Marcar mensagem como processada ANTES de processar para evitar duplicatas
  if (messageId) {
    markMessageAsProcessed(messageId);
  }

  try {
    console.log("[Webhook] 🚀 Iniciando processamento da mensagem");
    await processWhatsAppMessage({
      phone,
      text: text || buttonId || listId || "",
      buttonId,
      listId,
      pushName: pushName || undefined,
    });
    
    console.log("[Webhook] processamento concluído");
  } catch (err) {
    console.error("[Webhook] ERRO:", err);
    // Em caso de erro, remover marcação para permitir retry
    if (messageId) {
      processedMessageIds.delete(messageId);
    }
  }

  return NextResponse.json({ ok: true });
}