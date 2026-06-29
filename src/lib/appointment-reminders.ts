import { addMinutes, subMinutes } from "date-fns";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";
import {
  appointmentStartsAt,
  sendAppointmentCancelledNotice,
  sendConfirmWarning,
  sendReminder4h,
} from "./appointment-whatsapp";

const ACTIVE = [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING];

/** Cron: lembretes, aviso antes do horário, cancelamento automático (tempos configuráveis no admin) */
export async function processAppointmentRemindersAndAutoCancel(): Promise<{
  reminder4h: number;
  warnings: number;
  autoCancelled: number;
}> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.whatsappEnabled) {
    return { reminder4h: 0, warnings: 0, autoCancelled: 0 };
  }

  const reminder4hMin = settings.reminder4hMin ?? 240;
  const reminder30minMin = settings.reminder30minMin ?? 30;
  const autoCancelMin = settings.autoCancelMin ?? 10;

  const now = new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE },
      date: { gte: subMinutes(now, 60) },
    },
    include: { client: true, service: true },
  });

  let reminder4h = 0;
  let warnings = 0;
  let autoCancelled = 0;

  for (const apt of appointments) {
    const startsAt = appointmentStartsAt(apt.date, apt.startTime);
    if (startsAt <= now) continue;

    const minsUntil = (startsAt.getTime() - now.getTime()) / 60000;

    if (!apt.reminder4hSentAt && minsUntil <= reminder4hMin + 5 && minsUntil >= reminder4hMin - 25) {
      await sendReminder4h(apt);
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { reminder4hSentAt: now },
      });
      reminder4h++;
    }

    if (
      !apt.clientConfirmedAt &&
      !apt.confirmWarningSentAt &&
      minsUntil <= reminder30minMin + 2 &&
      minsUntil >= reminder30minMin - 2
    ) {
      await sendConfirmWarning(apt);
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { confirmWarningSentAt: now },
      });
      warnings++;
    }

    const shouldAutoCancel =
      !apt.clientConfirmedAt &&
      apt.confirmWarningSentAt &&
      now >= addMinutes(apt.confirmWarningSentAt, autoCancelMin);

    if (shouldAutoCancel) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { status: AppointmentStatus.CANCELLED },
      });
      await sendAppointmentCancelledNotice(
        apt,
        "O horário foi liberado por falta de confirmação no prazo combinado."
      );
      autoCancelled++;
    }
  }

  return { reminder4h, warnings, autoCancelled };
}

/** Mantido para compatibilidade — delega ao fluxo novo */
export async function sendDueAppointmentReminders() {
  const result = await processAppointmentRemindersAndAutoCancel();
  return {
    sent: result.reminder4h + result.warnings,
    skipped: 0,
    ...result,
  };
}
