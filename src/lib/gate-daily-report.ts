import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { cerebrasChat, isCerebrasConfigured } from "./cerebras-ai";
import { appointmentStartsAt } from "./appointment-whatsapp";

type JsonRecord = Record<string, unknown>;

export type GateDailyReport = {
  date: string;
  generatedAt: string;
  summary: string;
  source: string;
  metrics: {
    entries: number;
    exits: number;
    completedCycles: number;
    averageMinutes: number;
    delayed: number;
    unmatched: number;
    cameraFailures: number;
    timelapsesSent: number;
  };
  reused: boolean;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function targetBusinessDay(now = new Date()) {
  const reference = new Date(now.getTime() - 12 * 60 * 60_000);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
  const start = new Date(`${date}T03:00:00.000Z`);
  return { date, start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

function eventDate(data: JsonRecord, fallback: Date) {
  const capturedAt = typeof data.capturedAt === "string" ? new Date(data.capturedAt) : fallback;
  return Number.isNaN(capturedAt.getTime()) ? fallback : capturedAt;
}

export async function generateGateDailyReport(now = new Date()): Promise<GateDailyReport> {
  const { date, start, end } = targetBusinessDay(now);
  const existing = await prisma.auditLog.findFirst({
    where: { action: "GATE_VISION_DAILY_REPORT", resource: `gate-daily:${date}` },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { ...(record(existing.data) as Omit<GateDailyReport, "reused">), reused: true };

  const [events, heartbeats] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: { in: ["GATE_VISION_ENTER", "GATE_VISION_EXIT", "GATE_VISION_IGNORED"] },
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { action: "GATE_VISION_HEARTBEAT", createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const entries = events.filter((item) => item.action === "GATE_VISION_ENTER" && record(item.data).matched === true);
  const exits = events.filter((item) => item.action === "GATE_VISION_EXIT" && record(item.data).matched === true);
  const appointmentIds = [...new Set(entries.map((item) => String(record(item.data).appointmentId || "")).filter(Boolean))];
  const appointments = appointmentIds.length
    ? await prisma.appointment.findMany({ where: { id: { in: appointmentIds } } })
    : [];
  const appointmentMap = new Map(appointments.map((item) => [item.id, item]));

  const exitsByAppointment = new Map<string, Date>();
  for (const item of exits) {
    const data = record(item.data);
    const id = typeof data.appointmentId === "string" ? data.appointmentId : "";
    if (id && !exitsByAppointment.has(id)) exitsByAppointment.set(id, eventDate(data, item.createdAt));
  }
  const durations: number[] = [];
  let delayed = 0;
  for (const item of entries) {
    const data = record(item.data);
    const id = typeof data.appointmentId === "string" ? data.appointmentId : "";
    const enteredAt = eventDate(data, item.createdAt);
    const exitedAt = exitsByAppointment.get(id);
    if (exitedAt && exitedAt > enteredAt) durations.push(Math.round((exitedAt.getTime() - enteredAt.getTime()) / 60_000));
    const appointment = appointmentMap.get(id);
    if (appointment && enteredAt.getTime() - appointmentStartsAt(appointment.date, appointment.startTime).getTime() > 15 * 60_000) delayed += 1;
  }

  let cameraFailures = heartbeats.length ? 0 : 1;
  for (let index = 1; index < heartbeats.length; index += 1) {
    if (heartbeats[index].createdAt.getTime() - heartbeats[index - 1].createdAt.getTime() > 4 * 60_000) cameraFailures += 1;
  }
  const unmatched = events.filter((item) => {
    const data = record(item.data);
    return item.action === "GATE_VISION_IGNORED" || (item.action !== "GATE_VISION_IGNORED" && data.matched !== true);
  }).length;
  const metrics = {
    entries: entries.length,
    exits: exits.length,
    completedCycles: durations.length,
    averageMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    delayed,
    unmatched,
    cameraFailures,
    timelapsesSent: exits.filter((item) => record(item.data).timelapseSent === true).length,
  };
  const fallback = metrics.entries
    ? `A garagem recebeu ${metrics.entries} veículo(s), com ${metrics.completedCycles} ciclo(s) completo(s) e tempo médio de ${metrics.averageMinutes} minutos. ${metrics.delayed} atraso(s), ${metrics.unmatched} leitura(s) sem associação e ${metrics.cameraFailures} possível(is) interrupção(ões) da câmera.`
    : `Nenhuma entrada associada foi registrada em ${date}. Houve ${metrics.unmatched} leitura(s) sem associação e ${metrics.cameraFailures} possível(is) interrupção(ões) da câmera.`;
  let summary = fallback;
  let source = "rules";
  if (isCerebrasConfigured()) {
    const ai = await cerebrasChat({
      system: "Você é o gerente operacional de uma estética automotiva. Resuma os números do portão em português, em até 3 frases curtas. Destaque volume, tempo, atrasos e falhas. Não invente dados nem use markdown.",
      user: JSON.stringify({ date, metrics }),
      maxTokens: 180,
      temperature: 0.15,
    });
    if (ai) {
      summary = ai.trim().slice(0, 700);
      source = "cerebras";
    }
  }
  const report = { date, generatedAt: now.toISOString(), summary, source, metrics, reused: false };
  await logAudit({ action: "GATE_VISION_DAILY_REPORT", resource: `gate-daily:${date}`, data: report });
  return report;
}

export async function getLatestGateDailyReport() {
  const item = await prisma.auditLog.findFirst({
    where: { action: "GATE_VISION_DAILY_REPORT" },
    orderBy: { createdAt: "desc" },
  });
  return item ? record(item.data) : null;
}
