import { AppointmentStatus } from "@prisma/client";
import { addMinutes, startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import {
  appointmentStartsAt,
  sendConfirmationReceived,
} from "./appointment-whatsapp";

export function isConfirmationMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(confirme|confirmo|confirmar|sim|ok|confirmado|1)$/.test(t);
}

/** Responde CONFIRME para agendamento pendente de confirmação */
export async function tryHandleAppointmentConfirmation(
  phone: string,
  text: string
): Promise<boolean> {
  if (!isConfirmationMessage(text)) return false;

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
