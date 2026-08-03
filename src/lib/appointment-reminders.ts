import { addMinutes, subMinutes, subHours, subDays } from "date-fns";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";
import {
  appointmentStartsAt,
  sendAppointmentCancelledNotice,
  sendConfirmWarning,
  sendReminder2h,
  sendReminderCustom,
} from "./appointment-whatsapp";
import { isPhoneBlocked } from "./blocked-phones";

const ACTIVE = [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING];

/** Cron: confirmação 2h antes, lembretes opcionais e proteção contra ausência. */
export async function processAppointmentRemindersAndAutoCancel(): Promise<{
  reminderCustom: number;
  reminder2h: number;
  /** Campo legado mantido para consumidores antigos da API. */
  reminder4h: number;
  warnings: number;
  autoCancelled: number;
}> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.whatsappEnabled) {
    return { reminderCustom: 0, reminder2h: 0, reminder4h: 0, warnings: 0, autoCancelled: 0 };
  }

  const reminder2hMin = 120;
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

  let reminderCustom = 0;
  let reminder2h = 0;
  let warnings = 0;
  let autoCancelled = 0;

  for (const apt of appointments) {
    try {
      const startsAt = appointmentStartsAt(apt.date, apt.startTime);
      if (startsAt <= now) continue;

      // Bloqueio: evita respostas automáticas do bot
      if (apt.client?.phone && (await isPhoneBlocked(apt.client.phone))) {
        continue;
      }

      const minsUntil = (startsAt.getTime() - now.getTime()) / 60000;

      // Custom reminders based on user preference
      if (apt.reminderPreference) {
        let shouldSend = false;
        let updateData: any = {};

        if (apt.reminderPreference === "30min" && !apt.reminder30minSentAt) {
          shouldSend = minsUntil <= 35 && minsUntil >= 25;
          updateData = { reminder30minSentAt: now };
        } else if (apt.reminderPreference === "1hour" && !apt.reminder1hSentAt) {
          shouldSend = minsUntil <= 65 && minsUntil >= 55;
          updateData = { reminder1hSentAt: now };
        } else if (apt.reminderPreference === "1day" && !apt.reminder1daySentAt) {
          const hoursUntil = minsUntil / 60;
          shouldSend = hoursUntil <= 25 && hoursUntil >= 23;
          updateData = { reminder1daySentAt: now };
        }

        if (shouldSend && Object.keys(updateData).length > 0) {
          const sent = await sendReminderCustom(apt, apt.reminderPreference);
          if (sent) {
            await prisma.appointment.update({
              where: { id: apt.id },
              data: updateData,
            });
            reminderCustom++;
          }
        }
      }

      // Confirmação antecipada padrão para todos (campo reminder4hSentAt é
      // legado e continua sendo usado para evitar duplicidade no banco).
      if (!apt.reminder4hSentAt && isAdvanceConfirmationDue(minsUntil, reminder2hMin)) {
        const sent = await sendReminder2h(apt);
        if (sent) {
          await prisma.appointment.update({
            where: { id: apt.id },
            data: { reminder4hSentAt: now },
          });
          reminder2h++;
        }
      }

      // Confirm warning (30min before)
      if (
        !apt.clientConfirmedAt &&
        !apt.confirmWarningSentAt &&
        minsUntil <= reminder30minMin + 2 &&
        minsUntil >= reminder30minMin - 2
      ) {
        const sent = await sendConfirmWarning(apt);
        if (sent) {
          await prisma.appointment.update({
            where: { id: apt.id },
            data: { confirmWarningSentAt: now },
          });
          warnings++;
        }
      }

      // Auto cancel
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
    } catch (error) {
      console.error(`[Reminders] Falha ao processar agendamento ${apt.id}, pulando:`, error);
      continue; // não deixa 1 falha travar os outros clientes
    }
  }

  return {
    reminderCustom,
    reminder2h,
    reminder4h: reminder2h,
    warnings,
    autoCancelled,
  };
}

export function isAdvanceConfirmationDue(minsUntil: number, targetMinutes = 120): boolean {
  return minsUntil <= targetMinutes + 5 && minsUntil >= targetMinutes - 25;
}

/** Mantido para compatibilidade — delega ao fluxo novo */
export async function sendDueAppointmentReminders() {
  const result = await processAppointmentRemindersAndAutoCancel();
  return {
    sent: result.reminder2h + result.warnings,
    skipped: 0,
    ...result,
  };
}
