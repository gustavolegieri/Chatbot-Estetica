import { AppointmentStatus } from "@prisma/client";
import type { Appointment, Client, Service } from "@prisma/client";
import {
  sendAppointmentCancelledNotice,
  sendAppointmentThankYou,
} from "./appointment-whatsapp";

type AptFull = Appointment & { client: Client; service: Service };

export async function onAppointmentStatusChange(
  previous: AppointmentStatus,
  updated: AptFull
) {
  if (previous === updated.status) return;

  if (updated.status === AppointmentStatus.COMPLETED) {
    await sendAppointmentThankYou(updated);
  }

  if (
    updated.status === AppointmentStatus.CANCELLED &&
    previous !== AppointmentStatus.CANCELLED
  ) {
    if (updated.source === "whatsapp" || previous === AppointmentStatus.CONFIRMED) {
      await sendAppointmentCancelledNotice(
        updated,
        "Cancelamento registrado pela equipe. O horário voltou a ficar disponível."
      );
    }
  }

  // Notificações (painel admin)
  try {
    if (updated.status === AppointmentStatus.CANCELLED && previous !== AppointmentStatus.CANCELLED) {
      const { notifyCancelledAppointment } = await import("./notifications");
      await notifyCancelledAppointment(updated, "Cancelamento registrado pela equipe. O horário voltou a ficar disponível.");
    }
  } catch {
    // noop
  }
}
