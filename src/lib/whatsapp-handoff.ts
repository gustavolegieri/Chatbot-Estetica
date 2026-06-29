import { HandoffStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { normalizePhone } from "./utils";

/** Cliente pediu falar com dono/atendente humano */
export function wantsHumanHandoff(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /falar com (o )?(dono|propriet[aá]rio|gerente|respons[aá]vel|atendente|humano|pessoa|algu[eé]m|voc[eê]|ka)/.test(t) ||
    /quero (um )?(atendimento humano|atendente real|pessoa real)/.test(t) ||
    /preciso falar (com )?(algu[eé]m|voc[eê]|o dono|humano)/.test(t) ||
    /(passa|passar|transferir|chama) (pro|para o|o )?(dono|atendente|gerente|humano)/.test(t) ||
    /n[aã]o [eé] (bot|rob[oô]|m[aá]quina)/.test(t) ||
    /atendimento humano|humano por favor|falar com humano/.test(t) ||
    /^(atendente|humano|dono|gerente)$/.test(t)
  );
}

export async function requestHumanHandoff(params: {
  phone: string;
  sessionId: string;
  reason: string;
  clientName?: string;
}) {
  const phone = normalizePhone(params.phone);
  const now = new Date();

  await prisma.whatsAppSession.update({
    where: { id: params.sessionId },
    data: {
      handoffStatus: HandoffStatus.PENDING,
      handoffAt: now,
      handoffReason: params.reason.slice(0, 500),
      botPaused: true,
      unreadCount: { increment: 1 },
    },
  });

  const name = params.clientName ? `, *${params.clientName}*` : "";
  await sendText({
    number: phone,
    text: [
      `Entendi${name}! 😊`,
      ``,
      `Vou avisar nossa equipe — em breve alguém da *Garagem do Ka* entra em contato com você por aqui.`,
      ``,
      `_Enquanto isso, pode continuar escrevendo sua dúvida._`,
    ].join("\n"),
    flowStage: "HANDOFF",
  });
}

export async function isBotPausedForPhone(phone: string): Promise<boolean> {
  const session = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(phone) },
    select: { botPaused: true, handoffStatus: true },
  });
  if (!session) return false;
  return session.botPaused && session.handoffStatus !== HandoffStatus.RESOLVED;
}
