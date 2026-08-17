import { AppointmentStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { onAppointmentStatusChange } from "@/lib/appointment-lifecycle";
import { notifyPwaOperationalAlert } from "@/lib/pwa-push";
import { uploadImageToCloudinary } from "@/lib/image-upload";
import { sendText } from "@/lib/evolution-api";
import { isValidVehiclePlate, normalizeVehiclePlate } from "@/lib/whatsapp-vehicle-parse";

export type GateEventType = "ENTER" | "EXIT";
export type GateStage = "WAITING" | "WASHING" | "FINALIZED";

export type GateVisionEvent = {
  eventId: string;
  deviceId: string;
  type: GateEventType;
  capturedAt?: string;
  confidence: number;
  plate?: string;
  plateConfidence?: number;
  trackId?: string;
  snapshotDataUrl?: string;
};

export type GateHeartbeat = {
  eventId: string;
  deviceId: string;
  capturedAt?: string;
  cameraName?: string;
  fps?: number;
  model?: string;
  width?: number;
  height?: number;
};

export const gateStageMeta: Record<GateStage, { label: string; description: string }> = {
  WAITING: { label: "Aguardando veículo", description: "Portão livre e câmera monitorando" },
  WASHING: { label: "Lavagem iniciada", description: "Entrada do veículo confirmada pela IA" },
  FINALIZED: { label: "Finalização", description: "Saída do veículo confirmada pela IA" },
};

const FINALIZATION_VISIBLE_MS = 30 * 60_000;

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function businessDayRange(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${date}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export function classifyGateCrossing(
  centroidY: number[],
  outsideLine = 0.42,
  insideLine = 0.62
): GateEventType | null {
  if (centroidY.length < 2 || outsideLine >= insideLine) return null;
  const first = centroidY[0];
  const last = centroidY[centroidY.length - 1];
  if (first <= outsideLine && last >= insideLine) return "ENTER";
  if (first >= insideLine && last <= outsideLine) return "EXIT";
  return null;
}

async function uploadSnapshot(dataUrl?: string) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(?:jpeg|jpg|png);base64,(.+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 2_500_000) return null;
  const result = await uploadImageToCloudinary(buffer, `portao-${Date.now()}.jpg`, "gate-vision");
  return result.success ? result.url || null : null;
}

async function findEntryAppointment(plateInput: string, now = new Date()) {
  const plate = normalizeVehiclePlate(plateInput);
  if (!isValidVehiclePlate(plate)) return null;
  const { start, end } = businessDayRange(now);
  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: start, lt: end },
      status: { in: [AppointmentStatus.IN_PROGRESS, AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
    },
    include: { client: true, service: true },
    orderBy: { startTime: "asc" },
  });
  const appointment = appointments.find((item) => normalizeVehiclePlate(item.client.vehiclePlate || "") === plate);
  return appointment ? { appointment, match: "plate" as const } : null;
}

async function latestGateEvent() {
  return prisma.auditLog.findFirst({
    where: { action: { in: ["GATE_VISION_ENTER", "GATE_VISION_EXIT"] } },
    orderBy: { createdAt: "desc" },
  });
}

async function createCompletionIncome(appointment: NonNullable<Awaited<ReturnType<typeof findEntryAppointment>>>["appointment"]) {
  const existing = await prisma.financialRecord.findFirst({
    where: { appointmentId: appointment.id, type: "INCOME" },
  });
  if (existing) return;
  await prisma.financialRecord.create({
    data: {
      type: "INCOME",
      category: "SERVICE",
      amount: appointment.finalPrice ?? appointment.service.price,
      description: `Serviço finalizado automaticamente - ${appointment.service.name}`,
      appointmentId: appointment.id,
      serviceId: appointment.serviceId,
    },
  });
}

async function sendGateFinalizationMessage(appointment: NonNullable<Awaited<ReturnType<typeof findEntryAppointment>>>["appointment"]) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings?.whatsappEnabled || !appointment.client.phone) return false;
  await sendText({
    number: appointment.client.phone,
    text: [
      "✅ *Atendimento finalizado*",
      "",
      `Olá, *${appointment.client.name}*. O serviço *${appointment.service.name}* foi finalizado e registramos a saída do seu ${appointment.client.vehicleModel || "veículo"}.`,
      "",
      `Obrigado por confiar na *${settings.businessName || "Garagem do Ka"}*. Como foi sua experiência? Responda com uma nota de *1 a 5*.`,
    ].join("\n"),
  });
  return true;
}

async function alertUnmatched(type: GateEventType, plate?: string | null) {
  return notifyPwaOperationalAlert({
    title: type === "ENTER" ? "Entrada sem agendamento associado" : "Saída sem atendimento em andamento",
    body: type === "ENTER"
      ? plate
        ? `A câmera leu a placa ${plate}, mas não encontrou um agendamento ativo correspondente para hoje.`
        : "Um veículo entrou, mas a câmera não conseguiu ler a placa com confiança suficiente."
      : "A câmera detectou uma saída, mas não encontrou o atendimento iniciado por ela.",
    tag: `gate-vision-${type.toLowerCase()}-unmatched`,
    url: "/admin/gate-vision",
    urgency: "high",
  });
}

export async function recordGateHeartbeat(input: GateHeartbeat) {
  const duplicate = await prisma.auditLog.findFirst({ where: { resource: `gate-event:${input.eventId}` } });
  if (duplicate) return { duplicate: true };
  const recent = await prisma.auditLog.findFirst({
    where: { action: "GATE_VISION_HEARTBEAT", createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (!recent) {
    await logAudit({
      action: "GATE_VISION_HEARTBEAT",
      resource: `gate-event:${input.eventId}`,
      data: { ...input, capturedAt: input.capturedAt || new Date().toISOString() },
    });
  }
  return { duplicate: false, online: true };
}

export async function processGateVisionEvent(input: GateVisionEvent) {
  const duplicate = await prisma.auditLog.findFirst({ where: { resource: `gate-event:${input.eventId}` } });
  if (duplicate) return { duplicate: true, ignored: true };

  const previousLog = await latestGateEvent();
  const previousData = jsonRecord(previousLog?.data);
  const previousType = previousLog?.action === "GATE_VISION_ENTER" ? "ENTER" : previousLog?.action === "GATE_VISION_EXIT" ? "EXIT" : null;
  if (previousType === input.type) {
    await logAudit({
      action: "GATE_VISION_IGNORED",
      resource: `gate-event:${input.eventId}`,
      data: { ...input, reason: `Evento ${input.type} repetido sem travessia inversa` },
    });
    return { duplicate: false, ignored: true, reason: "logical-duplicate" };
  }

  const snapshotUrl = await uploadSnapshot(input.snapshotDataUrl);
  const capturedAt = input.capturedAt || new Date().toISOString();
  const plate = normalizeVehiclePlate(input.plate || "");
  const validPlate = isValidVehiclePlate(plate) && (input.plateConfidence ?? 0) >= 0.55;

  if (input.type === "ENTER") {
    const match = validPlate ? await findEntryAppointment(plate, new Date(capturedAt)) : null;
    if (!match) {
      await logAudit({
        action: "GATE_VISION_ENTER",
        resource: `gate-event:${input.eventId}`,
        data: { ...input, plate: plate || null, snapshotDataUrl: undefined, snapshotUrl, appointmentId: null, stage: "WASHING", matched: false },
      });
      await alertUnmatched("ENTER", plate || null);
      return { duplicate: false, ignored: false, stage: "WASHING" as GateStage, appointment: null };
    }

    const original = match.appointment;
    const updated = original.status === AppointmentStatus.IN_PROGRESS
      ? original
      : await prisma.appointment.update({
          where: { id: original.id },
          data: { status: AppointmentStatus.IN_PROGRESS },
          include: { client: true, service: true },
        });
    if (original.status !== AppointmentStatus.IN_PROGRESS) await onAppointmentStatusChange(original.status, updated);
    await logAudit({
      action: "GATE_VISION_ENTER",
      resource: `gate-event:${input.eventId}`,
      data: {
        ...input,
        snapshotDataUrl: undefined,
        snapshotUrl,
        plate,
        capturedAt,
        appointmentId: original.id,
        clientName: original.client.name,
        vehicle: original.client.vehicleModel,
        service: original.service.name,
        stage: "WASHING",
        matched: true,
        matchType: match.match,
      },
    });
    await notifyPwaOperationalAlert({
      title: "Lavagem iniciada automaticamente",
      body: `${original.client.name} · ${original.client.vehicleModel || original.service.name}`,
      tag: `gate-vision-enter-${original.id}`,
      url: "/admin/gate-vision",
    });
    return {
      duplicate: false,
      ignored: false,
      stage: "WASHING" as GateStage,
      appointment: { id: original.id, clientName: original.client.name, vehicle: original.client.vehicleModel, service: original.service.name },
    };
  }

  const appointmentId = typeof previousData.appointmentId === "string" ? previousData.appointmentId : null;
  const entryPlate = typeof previousData.plate === "string" ? normalizeVehiclePlate(previousData.plate) : "";
  if (appointmentId && entryPlate && !validPlate) {
    await logAudit({
      action: "GATE_VISION_IGNORED",
      resource: `gate-event:${input.eventId}`,
      data: { ...input, plate: plate || null, reason: `Placa não lida com confiança suficiente na saída; entrada registrada como ${entryPlate}` },
    });
    await notifyPwaOperationalAlert({
      title: "Confirme a placa na saída",
      body: `A placa de entrada foi ${entryPlate}, mas o OCR não confirmou a placa na saída. A finalização automática foi bloqueada.`,
      tag: "gate-vision-exit-plate-unread",
      url: "/admin/gate-vision",
      urgency: "high",
    });
    return { duplicate: false, ignored: true, reason: "exit-plate-unread" };
  }
  if (validPlate && entryPlate && plate !== entryPlate) {
    await logAudit({
      action: "GATE_VISION_IGNORED",
      resource: `gate-event:${input.eventId}`,
      data: { ...input, plate, reason: `Placa de saída ${plate} diferente da entrada ${entryPlate}` },
    });
    await notifyPwaOperationalAlert({
      title: "Placa divergente na saída",
      body: `Entrada ${entryPlate} · saída ${plate}. A finalização automática foi bloqueada.`,
      tag: "gate-vision-plate-mismatch",
      url: "/admin/gate-vision",
      urgency: "high",
    });
    return { duplicate: false, ignored: true, reason: "plate-mismatch" };
  }
  const appointment = appointmentId
    ? await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { client: true, service: true } })
    : null;
  if (!appointment) {
    await logAudit({
      action: "GATE_VISION_EXIT",
      resource: `gate-event:${input.eventId}`,
      data: { ...input, plate: plate || entryPlate || null, snapshotDataUrl: undefined, snapshotUrl, capturedAt, appointmentId: null, stage: "FINALIZED", matched: false },
    });
    await alertUnmatched("EXIT");
    return { duplicate: false, ignored: false, stage: "FINALIZED" as GateStage, appointment: null };
  }

  const originalStatus = appointment.status;
  const updated = originalStatus === AppointmentStatus.COMPLETED
    ? appointment
    : await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.COMPLETED },
        include: { client: true, service: true },
      });
  if (originalStatus !== AppointmentStatus.COMPLETED) {
    await createCompletionIncome(updated);
    await sendGateFinalizationMessage(updated);
  }
  await logAudit({
    action: "GATE_VISION_EXIT",
    resource: `gate-event:${input.eventId}`,
    data: {
      ...input,
      snapshotDataUrl: undefined,
      snapshotUrl,
      plate: plate || entryPlate,
      capturedAt,
      appointmentId: appointment.id,
      clientName: appointment.client.name,
      vehicle: appointment.client.vehicleModel,
      service: appointment.service.name,
      stage: "FINALIZED",
      matched: true,
    },
  });
  await notifyPwaOperationalAlert({
    title: "Atendimento em finalização",
    body: `${appointment.client.name} saiu da garagem · ${appointment.service.name}`,
    tag: `gate-vision-exit-${appointment.id}`,
    url: "/admin/gate-vision",
  });
  return {
    duplicate: false,
    ignored: false,
    stage: "FINALIZED" as GateStage,
    appointment: { id: appointment.id, clientName: appointment.client.name, vehicle: appointment.client.vehicleModel, service: appointment.service.name },
  };
}

export async function getGateVisionReport() {
  const { start, end } = businessDayRange();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [events, heartbeat, appointments, entriesWeek, exitsWeek] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: { in: ["GATE_VISION_ENTER", "GATE_VISION_EXIT", "GATE_VISION_IGNORED"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.auditLog.findFirst({ where: { action: "GATE_VISION_HEARTBEAT" }, orderBy: { createdAt: "desc" } }),
    prisma.appointment.findMany({
      where: { date: { gte: start, lt: end }, status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } },
      include: { client: true, service: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.auditLog.count({ where: { action: "GATE_VISION_ENTER", createdAt: { gte: weekStart } } }),
    prisma.auditLog.count({ where: { action: "GATE_VISION_EXIT", createdAt: { gte: weekStart } } }),
  ]);
  const lastMeaningful = events.find((item) => item.action !== "GATE_VISION_IGNORED") || null;
  const lastData = jsonRecord(lastMeaningful?.data);
  const heartbeatData = jsonRecord(heartbeat?.data);
  const recentFinalization = Boolean(lastMeaningful && Date.now() - lastMeaningful.createdAt.getTime() < FINALIZATION_VISIBLE_MS);
  const stage: GateStage = lastMeaningful?.action === "GATE_VISION_ENTER"
    ? "WASHING"
    : lastMeaningful?.action === "GATE_VISION_EXIT" && recentFinalization
      ? "FINALIZED"
      : "WAITING";
  const online = Boolean(heartbeat && Date.now() - heartbeat.createdAt.getTime() < 4 * 60_000);
  return {
    stage,
    stageMeta: gateStageMeta[stage],
    online,
    lastHeartbeatAt: heartbeat?.createdAt || null,
    camera: {
      name: typeof heartbeatData.cameraName === "string" ? heartbeatData.cameraName : "Webcam do portão",
      fps: typeof heartbeatData.fps === "number" ? heartbeatData.fps : 0,
      model: typeof heartbeatData.model === "string" ? heartbeatData.model : "YOLO local",
      resolution: heartbeatData.width && heartbeatData.height ? `${heartbeatData.width}×${heartbeatData.height}` : "Aguardando agente",
    },
    current: {
      clientName: typeof lastData.clientName === "string" ? lastData.clientName : null,
      vehicle: typeof lastData.vehicle === "string" ? lastData.vehicle : null,
      service: typeof lastData.service === "string" ? lastData.service : null,
      plate: typeof lastData.plate === "string" ? lastData.plate : null,
      appointmentId: typeof lastData.appointmentId === "string" ? lastData.appointmentId : null,
      snapshotUrl: typeof lastData.snapshotUrl === "string" ? lastData.snapshotUrl : null,
      since: lastMeaningful?.createdAt || null,
    },
    metrics: { entriesWeek, exitsWeek, automationRate: entriesWeek ? Math.round((Math.min(entriesWeek, exitsWeek) / entriesWeek) * 100) : 0 },
    timeline: events.map((item) => {
      const data = jsonRecord(item.data);
      return {
        id: item.id,
        type: item.action === "GATE_VISION_ENTER" ? "ENTER" : item.action === "GATE_VISION_EXIT" ? "EXIT" : "IGNORED",
        label: item.action === "GATE_VISION_ENTER" ? "Lavagem iniciada" : item.action === "GATE_VISION_EXIT" ? "Finalização" : "Leitura ignorada",
        clientName: typeof data.clientName === "string" ? data.clientName : null,
        vehicle: typeof data.vehicle === "string" ? data.vehicle : null,
        plate: typeof data.plate === "string" ? data.plate : null,
        plateConfidence: typeof data.plateConfidence === "number" ? data.plateConfidence : 0,
        confidence: typeof data.confidence === "number" ? data.confidence : 0,
        matched: data.matched === true,
        reason: typeof data.reason === "string" ? data.reason : null,
        snapshotUrl: typeof data.snapshotUrl === "string" ? data.snapshotUrl : null,
        at: item.createdAt,
      };
    }),
    appointments: appointments.map((item) => ({
      id: item.id,
      time: item.startTime,
      clientName: item.client.name,
      vehicle: item.client.vehicleModel,
      plate: item.client.vehiclePlate,
      service: item.service.name,
      status: item.status,
      isCurrent: item.id === lastData.appointmentId,
    })),
    configuration: {
      tokenConfigured: Boolean(process.env.GATE_VISION_DEVICE_TOKEN?.trim()),
      endpoint: "/api/admin/gate-vision",
      localOnly: true,
    },
  };
}

export function simulateGateVision() {
  const entryTrack = [0.18, 0.31, 0.43, 0.52, 0.64, 0.73];
  const exitTrack = [...entryTrack].reverse();
  return {
    lines: { outside: 0.42, inside: 0.62 },
    events: [
      { type: classifyGateCrossing(entryTrack), label: "Lavagem iniciada", confidence: 0.94, plate: "BRA2E19", plateConfidence: 0.91, positions: entryTrack },
      { type: classifyGateCrossing(exitTrack), label: "Finalização", confidence: 0.96, plate: "BRA2E19", plateConfidence: 0.93, positions: exitTrack },
    ],
    safe: true,
  };
}
