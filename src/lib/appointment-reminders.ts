import { addHours, format, parse, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";

function appointmentStartsAt(date: Date, startTime: string): Date {
  const day = format(date, "yyyy-MM-dd");
  return parse(`${day} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
}

/** Envia lembrete WhatsApp ~24h antes do horário do agendamento. */
export async function sendDueAppointmentReminders(): Promise<{
  sent: number;
  skipped: number;
}> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.whatsappEnabled) {
    return { sent: 0, skipped: 0 };
  }

  const now = new Date();
  const windowStart = addHours(now, 23);
  const windowEnd = addHours(now, 25);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
      reminderSentAt: null,
      date: { gte: subHours(now, 1) },
    },
    include: {
      client: true,
      service: true,
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const apt of appointments) {
    const startsAt = appointmentStartsAt(apt.date, apt.startTime);
    if (startsAt < windowStart || startsAt > windowEnd) {
      skipped++;
      continue;
    }

    if (!apt.client.phone) {
      skipped++;
      continue;
    }

    const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
    const businessName = settings.businessName ?? "Estética Automotiva";

    await sendText({
      number: apt.client.phone,
      text: [
        `⏰ *Lembrete — ${businessName}*`,
        "",
        `Olá, ${apt.client.name}!`,
        "",
        `Seu agendamento é *amanhã*:`,
        `🔧 ${apt.service.name}`,
        `📅 ${dateLabel} às ${apt.startTime}`,
        settings.businessAddress ? `📍 ${settings.businessAddress}` : "",
        "",
        `Qualquer dúvida, responda *menu*.`,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    await prisma.appointment.update({
      where: { id: apt.id },
      data: { reminderSentAt: now },
    });
    sent++;
  }

  return { sent, skipped };
}
