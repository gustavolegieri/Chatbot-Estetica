import { subDays, subHours } from "date-fns";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { isPhoneBlocked } from "./blocked-phones";
import type { FlowState } from "./whatsapp-flow-types";

function flowOf(value: unknown): FlowState {
  return value && typeof value === "object" && !Array.isArray(value) ? value as FlowState : { stage: "ETAPA2_MAIN_MENU" };
}

/** Envia uma única solicitação entre 2h e 48h após a conclusão do serviço. */
export async function sendAutomaticReviewRequests() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" }, select: { whatsappEnabled: true, businessName: true } });
  if (!settings?.whatsappEnabled) return { checked: 0, sent: 0 };
  const candidates = await prisma.appointment.findMany({
    where: { status: "COMPLETED", updatedAt: { gte: subDays(new Date(), 2), lte: subHours(new Date(), 2) } },
    include: { client: true, service: true }, take: 80,
  });
  let sent = 0;
  for (const appointment of candidates) {
    if (!appointment.client.phone || await isPhoneBlocked(appointment.client.phone)) continue;
    const alreadyRequested = await prisma.whatsAppMessage.findFirst({
      where: { phone: appointment.client.phone, direction: "OUTBOUND", flowStage: "POST_SERVICE_REVIEW", createdAt: { gte: appointment.updatedAt } },
      select: { id: true },
    });
    if (alreadyRequested) continue;
    const session = await prisma.whatsAppSession.findUnique({ where: { phone: appointment.client.phone } });
    if (session) {
      const flow = flowOf(session.metadata);
      await prisma.whatsAppSession.update({ where: { id: session.id }, data: { metadata: { ...flow, awaitingPostServiceRating: true } as object } });
    }
    await sendText({
      number: appointment.client.phone,
      flowStage: "POST_SERVICE_REVIEW",
      voiceReply: false,
      text: `Olá, *${appointment.client.name}*! Como foi sua experiência com o serviço *${appointment.service.name}*?\n\nResponda com uma nota de *1 a 5*. Sua avaliação é lida automaticamente e, se algo não ficou perfeito, nossa equipe assume o atendimento.`,
    });
    sent += 1;
  }
  return { checked: candidates.length, sent };
}
