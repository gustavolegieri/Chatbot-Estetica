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
  wasenderMessageId?: string | null;
}

export async function logWhatsAppMessage(params: LogMessageParams) {
  const phone = normalizePhone(params.phone);
  const preview = params.body.slice(0, 120);

  const data = {
      phone,
      sessionId: params.sessionId ?? undefined,
      clientId: params.clientId ?? undefined,
      direction: params.direction,
      sender: params.sender,
      body: params.body,
      flowStage: params.flowStage ?? undefined,
      wasenderMessageId: params.wasenderMessageId ?? undefined,
    };

  // O webhook cria primeiro um marcador atômico para deduplicação. Quando o
  // fluxo processa a mensagem, atualizamos esse mesmo registro com a sessão,
  // transcrição e etapa corretas, em vez de criar uma segunda linha no CRM.
  const message = params.wasenderMessageId
    ? await prisma.whatsAppMessage.upsert({
        where: { wasenderMessageId: params.wasenderMessageId },
        create: data,
        update: data,
      })
    : await prisma.whatsAppMessage.create({ data });

  if (params.sessionId) {
    await prisma.whatsAppSession.update({
      where: { id: params.sessionId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: preview,
        // Uma nova mensagem reabre automaticamente conversas arquivadas.
        inboxArchivedAt: null,
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
