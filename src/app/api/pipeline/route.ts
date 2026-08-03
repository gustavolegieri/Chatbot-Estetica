import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { flowStageLabel } from "@/lib/flow-stage-labels";

type PipelineColumn = "new" | "quote" | "scheduled" | "in_progress" | "completed";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [sessions, appointments] = await Promise.all([
    prisma.whatsAppSession.findMany({
      where: {
        updatedAt: { gte: ninetyDaysAgo },
        pendingAppointmentId: null,
        lastStage: { not: null },
        NOT: [{ phone: "" }, { phone: { startsWith: "test-" } }],
      },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 120,
    }),
    prisma.appointment.findMany({
      where: {
        OR: [
          { status: { in: ["PENDING", "CONFIRMED", "IN_PROGRESS"] } },
          { status: "COMPLETED", updatedAt: { gte: thirtyDaysAgo } },
        ],
      },
      include: { client: true, service: true },
      orderBy: { updatedAt: "desc" },
      take: 160,
    }),
  ]);

  const earlyStages = new Set([
    "ETAPA1_AWAITING_NAME",
    "ETAPA2_MAIN_MENU",
    "ETAPA2_SUB",
    "ETAPA3_SERVICE_ACTION",
    "ETAPA3_UNDECIDED_VEHICLE",
    "ETAPA3_UNDECIDED_PROBLEM",
    "ETAPA3_PACKAGE_ACTION",
    "ETAPA4_VEHICLE",
    "ETAPA4_VEHICLE_CONFIRM",
  ]);

  const sessionCards = sessions.map((item) => {
    const metadata = metadataObject(item.metadata);
    const column: PipelineColumn = earlyStages.has(item.lastStage ?? "") ? "new" : "quote";
    const clientName = item.client?.name ?? textValue(metadata.customerName) ?? "Novo contato";
    return {
      id: item.id,
      entityType: "session" as const,
      column,
      clientName,
      phone: item.phone,
      vehicle: item.client?.vehicleModel ?? textValue(metadata.vehicleRaw) ?? textValue(metadata.vehicleModel),
      service: textValue(metadata.serviceLabel) ?? "Interesse em avaliação",
      value: Number(metadata.quoteMax ?? metadata.quoteMin ?? 0),
      updatedAt: item.updatedAt.toISOString(),
      stageLabel: flowStageLabel(item.lastStage ?? ""),
      status: item.handoffStatus,
      href: `/admin/atendimento?phone=${encodeURIComponent(item.phone)}`,
    };
  });

  const appointmentCards = appointments.map((item) => {
    const column: PipelineColumn =
      item.status === "IN_PROGRESS"
        ? "in_progress"
        : item.status === "COMPLETED"
          ? "completed"
          : "scheduled";

    return {
      id: item.id,
      entityType: "appointment" as const,
      column,
      clientName: item.client.name,
      phone: item.client.phone,
      vehicle: item.client.vehicleModel ?? item.client.vehiclePlate ?? undefined,
      service: item.service.name,
      value: Number(item.finalPrice ?? item.service.price),
      updatedAt: item.updatedAt.toISOString(),
      date: item.date.toISOString(),
      startTime: item.startTime,
      stageLabel: item.status === "PENDING" ? "Reserva pendente" : item.status === "CONFIRMED" ? "Reserva confirmada" : item.status === "IN_PROGRESS" ? "Serviço em execução" : "Serviço concluído",
      status: item.status,
      href: `/admin/agendamentos?date=${item.date.toISOString().slice(0, 10)}`,
    };
  });

  const cards = [...sessionCards, ...appointmentCards];
  const counts = Object.fromEntries(
    (["new", "quote", "scheduled", "in_progress", "completed"] as PipelineColumn[]).map((column) => [
      column,
      cards.filter((card) => card.column === column).length,
    ])
  );

  return NextResponse.json({
    success: true,
    data: {
      cards,
      counts,
      metrics: {
        activeOpportunities: cards.filter((card) => card.column !== "completed").length,
        openValue: cards.filter((card) => card.column !== "completed").reduce((sum, card) => sum + card.value, 0),
        inService: counts.in_progress ?? 0,
        completedValue: cards.filter((card) => card.column === "completed").reduce((sum, card) => sum + card.value, 0),
      },
    },
  });
}
