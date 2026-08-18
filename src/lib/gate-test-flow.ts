import { AppointmentStatus } from "@prisma/client";
import { sendAppointmentCheckIn, sendAppointmentFinalizing, sendAppointmentThankYou } from "@/lib/appointment-whatsapp";
import { logAudit } from "@/lib/audit";
import { endGateLiveSession, startGateLiveSession } from "@/lib/gate-live";
import { prisma } from "@/lib/prisma";
import { sendText } from "@/lib/evolution-api";
import { normalizePhone } from "@/lib/utils";
import { isValidVehiclePlate, normalizeVehiclePlate } from "@/lib/whatsapp-vehicle-parse";

export type GateTestCommand = "ENTER" | "EXIT" | "COMPLETE";

export function parseGateTestCommand(text: string): GateTestCommand | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (["simular entrada", "carro chegou", "carro entrou", "iniciar lavagem teste"].includes(normalized)) return "ENTER";
  if (["simular saida", "carro saiu", "iniciar finalizacao teste"].includes(normalized)) return "EXIT";
  if (["simular finalizacao", "carro pronto", "finalizar atendimento teste"].includes(normalized)) return "COMPLETE";
  return null;
}

async function latestTestAppointment(phone: string) {
  return prisma.appointment.findFirst({
    where: {
      client: { phone: normalizePhone(phone) },
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS] },
    },
    include: { client: true, service: true },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function handleGateTestCommand(phone: string, text: string) {
  const command = parseGateTestCommand(text);
  if (!command) return false;
  const appointment = await latestTestAppointment(phone);
  if (!appointment) {
    await sendText({ number: phone, text: "Para simular o portão, conclua primeiro um agendamento neste fluxo. Depois envie *simular entrada*." });
    return true;
  }
  const plate = normalizeVehiclePlate(appointment.client.vehiclePlate || "");
  if (!isValidVehiclePlate(plate)) {
    await sendText({ number: phone, text: "Antes da simulação, preciso que o agendamento tenha uma placa brasileira válida cadastrada." });
    return true;
  }
  const deviceId = "portao-principal";

  if (command === "ENTER") {
    const updated = appointment.status === AppointmentStatus.IN_PROGRESS
      ? appointment
      : await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: AppointmentStatus.IN_PROGRESS },
          include: { client: true, service: true },
        });
    const live = await startGateLiveSession({
      appointmentId: updated.id,
      clientId: updated.clientId,
      deviceId,
      plate,
    });
    const sent = await sendAppointmentCheckIn(updated, null, live.url);
    await logAudit({
      action: "GATE_VISION_ENTER",
      resource: `gate-test:${updated.id}:${Date.now()}`,
      data: { appointmentId: updated.id, plate, deviceId, matched: true, stage: "WASHING", simulated: true, whatsappSent: sent, liveSessionId: live.session.id },
    });
    return true;
  }

  await endGateLiveSession({ appointmentId: appointment.id, deviceId, plate });
  if (command === "EXIT") {
    const sent = await sendAppointmentFinalizing(appointment);
    await logAudit({
      action: "GATE_VISION_EXIT",
      resource: `gate-test:${appointment.id}:${Date.now()}`,
      data: { appointmentId: appointment.id, plate, deviceId, matched: true, stage: "FINALIZING", simulated: true, whatsappSent: sent },
    });
    return true;
  }

  const completed = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.COMPLETED },
    include: { client: true, service: true },
  });
  await sendAppointmentThankYou(completed);
  await logAudit({
    action: "GATE_VISION_TEST_COMPLETED",
    resource: `gate-test:${appointment.id}:${Date.now()}`,
    data: { appointmentId: appointment.id, plate, deviceId, simulated: true },
  });
  return true;
}
