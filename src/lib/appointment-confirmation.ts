import { AppointmentStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import {
  appointmentStartsAt,
  sendConfirmationReceived,
} from "./appointment-whatsapp";
import type { FlowStage } from "./whatsapp-flow-types";

/** Etapas em que "1" e "sim" são opções de menu — não confirmar agendamento */
const STAGES_BLOCKING_CONFIRMATION: FlowStage[] = [
  "ETAPA1_AWAITING_NAME",
  "ETAPA2_MAIN_MENU",
  "ETAPA2_SUB",
  "ETAPA3_SERVICE_ACTION",
  "ETAPA3_PACKAGE_ACTION",
  "ETAPA3_UNDECIDED_VEHICLE",
  "ETAPA3_UNDECIDED_PROBLEM",
  "ETAPA4_VEHICLE",
  "ETAPA5_QUOTE",
  "ETAPA6_UPSELL",
  "ETAPA7_PERIOD",
  "ETAPA7_DAY",
  "ETAPA7_TIME",
  "ETAPA7_CUSTOM_DAY",
  "ETAPA8_PAYMENT",
  "ETAPA8_PAYMENT_NO_PIX",
  "ETAPA10_FAQ",
];

export function isConfirmationMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(confirme|confirmo|confirmar|confirmado|sim|ok|okay)$/.test(t);
}

/** Responde CONFIRME para agendamento pendente de confirmação */
export async function tryHandleAppointmentConfirmation(
  phone: string,
  text: string,
  flowStage?: FlowStage
): Promise<boolean> {
  if (!isConfirmationMessage(text)) return false;

  if (flowStage && STAGES_BLOCKING_CONFIRMATION.includes(flowStage)) {
    return false;
  }

  const normalized = normalizePhone(phone);
  const client = await prisma.client.findUnique({ where: { phone: normalized } });
  if (!client) return false;

  const now = new Date();
  const apt = await prisma.appointment.findFirst({
    where: {
      clientId: client.id,
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
      clientConfirmedAt: null,
      date: { gte: startOfDay(now) },
    },
    include: { client: true, service: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  if (!apt) return false;

  const startsAt = appointmentStartsAt(apt.date, apt.startTime);
  if (startsAt < now) return false;

  await prisma.appointment.update({
    where: { id: apt.id },
    data: { clientConfirmedAt: now, status: AppointmentStatus.CONFIRMED },
  });

  await sendConfirmationReceived(apt);
  return true;
}
