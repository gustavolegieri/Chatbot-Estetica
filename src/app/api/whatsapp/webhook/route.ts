
import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import { prisma } from "@/lib/prisma";
import { extractWasenderAudioMessage, transcribeWasenderAudio } from "@/lib/whatsapp-audio";
import { sendText } from "@/lib/evolution-api";
import { notifyPwaAboutWhatsAppMessage } from "@/lib/pwa-push";
import { applyWasenderContactEvents } from "@/lib/wasender-contacts";
import { isWasenderMessageTooOld } from "@/lib/wasender-timestamp";

export const runtime = "nodejs";
export const maxDuration = 60;

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

// A Wasender pode entregar o epoch em segundos ou milissegundos. Interpretar
// segundos como ms fazia mensagens válidas parecerem ser de 1970.
async function markMessageAsProcessed(
  messageId: string,
  phone: string,
  text: string,
  sessionId?: string,
  clientId?: string
): Promise<boolean> {
  try {
    await prisma.whatsAppMessage.create({
      data: {
        phone,
        body: text,
        direction: "INBOUND",
        sender: "CLIENT",
        wasenderMessageId: messageId,
        sessionId,
        clientId,
        flowStage: "WEBHOOK_DEDUP",
      }
    });
    return true;
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log("[Webhook] Mensagem já estava marcada como processada:", messageId);
      return false;
    } else {
      console.error("[Webhook] Erro ao marcar mensagem como processada:", error);
      return true;
    }
  }
}

async function deleteMessageProcessingMarker(messageId: string) {
  try {
    await prisma.whatsAppMessage.deleteMany({
      where: { wasenderMessageId: messageId },
    });
    console.log("[Webhook] Marcador de deduplicação removido após falha:", messageId);
  } catch (error) {
    console.error("[Webhook] Erro ao remover marcador de deduplicação:", error);
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: "Webhook endpoint is alive. This endpoint accepts POST requests for Wasender webhooks."
  });
}

export async function POST(req: NextRequest) {
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
  console.log("[Webhook] Evento recebido:", event);

  if (event === "contacts.upsert" || event === "contacts.update") {
    const updated = await applyWasenderContactEvents(payload.data);
    console.log(`[Webhook] ${updated} contato(s) atualizado(s) pelo evento ${event}`);
    return NextResponse.json({ ok: true, contactsUpdated: updated });
  }

  const isMessageEvent =
    event === "messages.received" ||
    event === "messages.upsert" ||
    event === "messages-personal.received" ||
    !event;

  if (!isMessageEvent) {
    console.log("[Webhook] Evento ignorado (não é mensagem):", event);
    return NextResponse.json({ ok: true });
  }

  const data = payload.data as Record<string, unknown> | undefined;
  if (!data) return NextResponse.json({ ok: true });

  const msgRaw = data.messages ?? data;
  const msg = msgRaw as Record<string, unknown>;

  const msgKey = (msg.key ?? {}) as Record<string, unknown>;
  console.log("[Webhook] Message key:", JSON.stringify(msgKey));

  if (msgKey.fromMe === true) {
    console.log("[Webhook] Mensagem do próprio bot, ignorando");
    return NextResponse.json({ ok: true });
  }

  const remoteJid = (msgKey.remoteJid ?? "") as string;
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log("[Webhook] Mensagem de grupo/broadcast, ignorando:", remoteJid);
    return NextResponse.json({ ok: true });
  }

  const phone = extractPhone(msgKey);
  if (!phone) {
    console.warn("[Webhook] phone inválido, key:", JSON.stringify(msgKey));
    return NextResponse.json({ ok: true });
  }
  
  console.log("[Webhook] Telefone extraído:", phone);

  // Aceita timestamp em segundos ou milissegundos e ignora apenas eventos 24h+.
  const messageTimestamp = msgKey.timestamp as number | string | undefined;
  if (isWasenderMessageTooOld(messageTimestamp)) {
    console.log("[Webhook] Ignorando mensagem com mais de 24 horas");
    return NextResponse.json({ ok: true });
  }

  // Deduplicação baseada em ID da mensagem (persistida no banco)
  const messageId = msgKey.id as string | undefined;
  console.log("[Webhook] messageId recebido:", messageId, "tipo:", typeof messageId);

  const originalText = extractText(msg);
  const audioMessage = extractWasenderAudioMessage(msg);
  const { buttonId, listId } = extractInteractive(msg);
  const pushName = (msg.pushName ?? msg.notifyName ?? "") as string;

  console.log("[Webhook] Conteúdo da mensagem:", {
    text: originalText?.substring(0, 50),
    hasAudio: Boolean(audioMessage),
    buttonId,
    listId,
    pushName
  });

  // Obter sessionId e clientId para marcar mensagem como processada
  let sessionId: string | undefined;
  let clientId: string | undefined;
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone },
      select: { id: true, clientId: true }
    });
    if (session) {
      sessionId = session.id;
      clientId = session.clientId || undefined;
    }
  } catch (error) {
    console.error("[Webhook] Erro ao buscar sessão:", error);
  }

  let markerCreated = false;
  if (messageId) {
    markerCreated = await markMessageAsProcessed(
      messageId,
      phone,
      originalText || buttonId || listId || (audioMessage ? "[Áudio recebido]" : ""),
      sessionId,
      clientId
    );
    if (!markerCreated) {
      return NextResponse.json({ ok: true });
    }
  } else {
    console.log("[Webhook] AVISO: messageId não disponível, deduplicação pode não funcionar");
  }

  try {
    console.log("[Webhook] Iniciando processamento da mensagem");

    let processedText = originalText || buttonId || listId || "";
    if (audioMessage) {
      if (!messageId) {
        throw new Error("Áudio recebido sem identificador de mensagem");
      }
      try {
        processedText = await transcribeWasenderAudio({ messageId, audio: audioMessage });
        console.log("[Webhook] Áudio transcrito com sucesso:", processedText.substring(0, 120));
      } catch (audioError) {
        console.error("[Webhook] Falha ao processar áudio:", audioError);
        await sendText({
          number: phone,
          text: "Recebi seu áudio, mas não consegui transcrevê-lo agora. Pode tentar novamente ou enviar a mensagem em texto?",
          flowStage: "AUDIO_TRANSCRIPTION_FALLBACK",
        });
        return NextResponse.json({ ok: true, audioProcessed: false });
      }
    }

    if (!processedText.trim()) {
      console.log("[Webhook] Mensagem sem conteúdo textual processável");
      await sendText({
        number: phone,
        text: "Recebi sua mensagem. No momento consigo entender melhor *texto* e *áudio*. Se enviou uma foto ou documento, escreva em uma frase o que deseja analisar.",
        flowStage: "UNSUPPORTED_MESSAGE_FALLBACK",
      });
      return NextResponse.json({ ok: true });
    }
    
    let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
    try {
      // @ts-ignore - waitUntil é disponível em edge runtime do Next.js
      waitUntil = req.waitUntil;
    } catch {
      // waitUntil não disponível, processamento será síncrono
    }
    
    await processWhatsAppMessage({
      phone,
      text: processedText,
      buttonId,
      listId,
      pushName: pushName || undefined,
      messageId,
      sourceType: audioMessage ? "audio" : "text",
    }, waitUntil);

    await notifyPwaAboutWhatsAppMessage({ phone, body: processedText }).catch((error) => {
      console.error("[Webhook] Falha isolada ao notificar PWA:", error);
    });

    console.log("[Webhook] processamento concluído");
  } catch (err) {
    console.error("[Webhook] ERRO:", err);
    if (markerCreated && messageId) {
      await deleteMessageProcessingMarker(messageId);
    }
    return NextResponse.json({ ok: false, retry: true }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
