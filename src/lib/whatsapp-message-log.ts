import { MessageDirection, MessageSender } from "./message-enums";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";

interface LogMessageParams {
  phone: string;
  sessionId?: string | null;
  clientId?: string | null;
  direction: MessageDirection;
  sender: MessageSender;
  body: string;
  flowStage?: string | null;
}

export async function logWhatsAppMessage(params: LogMessageParams) {
  const phone = normalizePhone(params.phone);
  const preview = params.body.slice(0, 120);

  const message = await prisma.whatsAppMessage.create({
    data: {
      phone,
      sessionId: params.sessionId ?? undefined,
      clientId: params.clientId ?? undefined,
      direction: params.direction,
      sender: params.sender,
      body: params.body,
      flowStage: params.flowStage ?? undefined,
    },
  });

  if (params.sessionId) {
    await prisma.whatsAppSession.update({
      where: { id: params.sessionId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: preview,
        ...(params.direction === MessageDirection.INBOUND
          ? { unreadCount: { increment: 1 } }
          : {}),
      },
    });
  }

  return message;
}

export async function markConversationRead(sessionId: string) {
  await prisma.whatsAppSession.update({
    where: { id: sessionId },
    data: { unreadCount: 0 },
  });
}
