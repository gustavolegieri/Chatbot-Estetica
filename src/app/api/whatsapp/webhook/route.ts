import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import { normalizePhone } from "@/lib/utils";

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      buttonsResponseMessage?: { selectedButtonId?: string };
      listResponseMessage?: {
        singleSelectReply?: { selectedRowId?: string };
      };
    };
  };
}

/** Apenas chat privado (DM). Ignora grupos, listas de transmissão e status. */
function isPrivateUserChat(remoteJid: string) {
  const jid = remoteJid.toLowerCase();
  if (jid.endsWith("@g.us")) return false;
  if (jid.endsWith("@broadcast")) return false;
  if (jid.includes("@newsletter")) return false;
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us");
}

function extractMessage(payload: EvolutionWebhookPayload) {
  const data = payload.data;
  if (!data?.key?.remoteJid || data.key.fromMe) return null;
  if (!isPrivateUserChat(data.key.remoteJid)) return null;

  const phone = normalizePhone(data.key.remoteJid.replace("@s.whatsapp.net", ""));
  const msg = data.message;

  let text = "";
  let buttonId: string | undefined;
  let listId: string | undefined;

  if (msg?.conversation) {
    text = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg?.buttonsResponseMessage?.selectedButtonId) {
    buttonId = msg.buttonsResponseMessage.selectedButtonId;
    text = buttonId;
  } else if (msg?.listResponseMessage?.singleSelectReply?.selectedRowId) {
    listId = msg.listResponseMessage.singleSelectReply.selectedRowId;
    text = listId;
  }

  if (!text && !buttonId && !listId) return null;

  return {
    phone,
    text,
    buttonId,
    listId,
    pushName: data.pushName,
  };
}

function isMessageUpsertEvent(event?: string) {
  if (!event) return false;
  const normalized = event.toLowerCase().replace(/_/g, ".");
  return normalized === "messages.upsert";
}

export async function POST(request: NextRequest) {
  try {
    const payload: EvolutionWebhookPayload = await request.json();

    if (!isMessageUpsertEvent(payload.event)) {
      return NextResponse.json({ success: true, ignored: true, event: payload.event });
    }

    const message = extractMessage(payload);
    if (!message) {
      return NextResponse.json({ success: true, ignored: true });
    }

    await processWhatsAppMessage(message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Webhook]", error);
    // 200 evita retentativas em loop pela Evolution API
    return NextResponse.json({ success: true, error: "Erro no processamento (ver logs)" });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Webhook Evolution API ativo",
    endpoint: "/api/whatsapp/webhook",
  });
}
