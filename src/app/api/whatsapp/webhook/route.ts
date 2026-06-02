import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import {
  isGroupWebhookPayload,
  isPrivateUserChat,
  phoneFromPrivateJid,
} from "@/lib/whatsapp-jid";

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      participant?: string;
    };
    isGroup?: boolean;
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

function extractMessage(payload: EvolutionWebhookPayload) {
  const data = payload.data;
  if (!data?.key?.remoteJid || data.key.fromMe) return null;

  // Grupos, comunidades e listas: ignorar totalmente
  if (isGroupWebhookPayload(data)) return null;
  if (!isPrivateUserChat(data.key.remoteJid)) return null;

  const phone = phoneFromPrivateJid(data.key.remoteJid);
  if (!phone) return null;

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
      return NextResponse.json({ success: true, ignored: true, reason: "not_private_chat" });
    }

    await processWhatsAppMessage(message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Webhook]", error);
    return NextResponse.json({ success: true, error: "Erro no processamento (ver logs)" });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Webhook Evolution API ativo (somente conversas privadas)",
    endpoint: "/api/whatsapp/webhook",
  });
}
