import { HandoffStatus } from "@prisma/client";
import { startOfDay, startOfMonth, subDays } from "date-fns";
import { prisma } from "./prisma";
import type { FlowState } from "./whatsapp-flow-types";

export function parseFlowMetadata(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") return { stage: "ETAPA1_AWAITING_NAME" };
  return raw as FlowState;
}

export async function getAtendimentoOverview() {
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());
  const weekAgo = subDays(new Date(), 7);

  const [
    pendingHandoffs,
    inProgressHandoffs,
    messagesToday,
    activeSessionsWeek,
    whatsappAppointmentsMonth,
    topServices,
    funnelStages,
    recentHandoffs,
  ] = await Promise.all([
    prisma.whatsAppSession.count({ where: { handoffStatus: HandoffStatus.PENDING } }),
    prisma.whatsAppSession.count({ where: { handoffStatus: HandoffStatus.IN_PROGRESS } }),
    prisma.whatsAppMessage.count({ where: { createdAt: { gte: today } } }),
    prisma.whatsAppSession.count({ where: { lastMessageAt: { gte: weekAgo } } }),
    prisma.appointment.count({
      where: { source: "whatsapp", createdAt: { gte: monthStart } },
    }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        source: "whatsapp",
        createdAt: { gte: monthStart },
        status: { notIn: ["CANCELLED"] },
      },
      _count: { id: true },
    }),
    prisma.whatsAppSession.findMany({
      where: { lastMessageAt: { gte: weekAgo } },
      select: { metadata: true },
    }),
    prisma.whatsAppSession.findMany({
      where: { handoffStatus: { in: [HandoffStatus.PENDING, HandoffStatus.IN_PROGRESS] } },
      orderBy: { handoffAt: "desc" },
      take: 10,
      include: { client: true },
    }),
  ]);

  const serviceIds = topServices.map((s) => s.serviceId).filter(Boolean) as string[];
  const services = serviceIds.length
    ? await prisma.service.findMany({ where: { id: { in: serviceIds } } })
    : [];
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.name]));

  const stageCounts: Record<string, number> = {};
  for (const s of funnelStages) {
    const flow = parseFlowMetadata(s.metadata);
    const stage = flow.stage ?? "UNKNOWN";
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  const topServicesFormatted = topServices
    .map((s) => ({
      serviceId: s.serviceId,
      name: s.serviceId ? serviceMap[s.serviceId] ?? "Serviço" : "—",
      count: s._count.id,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    pendingHandoffs,
    inProgressHandoffs,
    messagesToday,
    activeSessionsWeek,
    whatsappAppointmentsMonth,
    topServices: topServicesFormatted,
    funnelStages: stageCounts,
    recentHandoffs,
  };
}
