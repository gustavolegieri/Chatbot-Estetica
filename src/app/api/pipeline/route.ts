import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { flowStageLabel } from "@/lib/flow-stage-labels";
import { sendText } from "@/lib/evolution-api";
import { logWhatsAppMessage } from "@/lib/whatsapp-message-log";
import { normalizePhone } from "@/lib/utils";
import { MessageDirection, MessageSender } from "@/lib/message-enums";
import { getHubSpotPortalId, isHubSpotLeadSyncConfigured } from "@/lib/hubspot-leads";

type PipelineColumn = "new" | "quote" | "scheduled" | "in_progress" | "completed";

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: NextRequest) {
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
        NOT: [{ phone: "" }, { phone: { startsWith: "test-" } }],
      },
      include: { client: true },
      orderBy: { updatedAt: "desc" },
      take: 240,
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

  const appointmentPhones = new Set(appointments.map((item) => normalizePhone(item.client.phone)));
  const sessionCards = sessions.filter((item) => !appointmentPhones.has(normalizePhone(item.phone))).map((item) => {
    const metadata = metadataObject(item.metadata);
    const currentStage = item.lastStage ?? textValue(metadata.stage) ?? "ETAPA1_AWAITING_NAME";
    const automaticColumn: PipelineColumn = earlyStages.has(currentStage) ? "new" : "quote";
    const manualColumn = textValue(metadata.crmColumn);
    const column: PipelineColumn =
      manualColumn === "new" || manualColumn === "quote" ? manualColumn : automaticColumn;
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
      stageLabel: flowStageLabel(currentStage),
      status: item.handoffStatus,
      unreadCount: item.unreadCount,
      lastMessagePreview: item.lastMessagePreview ?? undefined,
      source: textValue(metadata.leadSource) ?? "WhatsApp",
      marketingConsent: metadata.marketingConsent === true,
      leadCity: textValue(metadata.leadCity),
      leadCapturedAt: textValue(metadata.leadCapturedAt),
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
      unreadCount: 0,
      source: item.source || "Agenda",
      href: `/admin/agendamentos?date=${item.date.toISOString().slice(0, 10)}`,
    };
  });

  const cards = [...sessionCards, ...appointmentCards];
  const weeklyTarget = 10;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyCaptured = sessionCards.filter((card) => {
    const capturedAt = card.leadCapturedAt ? new Date(card.leadCapturedAt).getTime() : Number.NaN;
    return card.marketingConsent && Number.isFinite(capturedAt) && capturedAt >= sevenDaysAgo;
  });
  const sourceBreakdown = Object.entries(
    weeklyCaptured.reduce<Record<string, number>>((result, card) => {
      result[card.source] = (result[card.source] ?? 0) + 1;
      return result;
    }, {})
  )
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  const captureBaseUrl = `${request.nextUrl.origin}/jundiai`;
  const shareLinks = [
    { source: "instagram", label: "Instagram", url: `${captureBaseUrl}?origem=instagram` },
    { source: "google", label: "Google", url: `${captureBaseUrl}?origem=google` },
    { source: "indicacao", label: "Indicação", url: `${captureBaseUrl}?origem=indicacao` },
    { source: "parceiro", label: "Parceiros locais", url: `${captureBaseUrl}?origem=parceiro` },
  ];
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
        weeklyLeads: weeklyCaptured.length,
        weeklyTarget,
        weeklyProgress: Math.min(100, Math.round((weeklyCaptured.length / weeklyTarget) * 100)),
        activeOpportunities: cards.filter((card) => card.column !== "completed").length,
        openValue: cards.filter((card) => card.column !== "completed").reduce((sum, card) => sum + card.value, 0),
        inService: counts.in_progress ?? 0,
        completedValue: cards.filter((card) => card.column === "completed").reduce((sum, card) => sum + card.value, 0),
      },
      sourceBreakdown,
      shareLinks,
      integrations: {
        hubspot: {
          configured: isHubSpotLeadSyncConfigured(),
          portalId: getHubSpotPortalId(),
        },
      },
    },
  });
}

const moveLeadSchema = z.object({
  sessionId: z.string().min(1),
  column: z.enum(["new", "quote"]),
});

export async function PATCH(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const input = moveLeadSchema.parse(await request.json());
    const lead = await prisma.whatsAppSession.findUnique({ where: { id: input.sessionId } });
    if (!lead) return NextResponse.json({ success: false, error: "Lead não encontrado" }, { status: 404 });
    const metadata = metadataObject(lead.metadata);
    await prisma.whatsAppSession.update({
      where: { id: lead.id },
      data: {
        metadata: {
          ...metadata,
          crmColumn: input.column,
          crmUpdatedAt: new Date().toISOString(),
          crmUpdatedBy: auth.userId,
        },
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Movimentação inválida" }, { status: 400 });
    }
    console.error("[Pipeline PATCH]", error);
    return NextResponse.json({ success: false, error: "Não foi possível mover o lead" }, { status: 500 });
  }
}

const messageLeadSchema = z.object({
  phone: z.string().min(8),
  text: z.string().trim().min(2).max(1200),
});

export async function POST(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const input = messageLeadSchema.parse(await request.json());
    const phone = normalizePhone(input.phone);
    const conversation = await prisma.whatsAppSession.findUnique({ where: { phone } });
    if (!conversation) {
      return NextResponse.json({ success: false, error: "Conversa do WhatsApp não encontrada" }, { status: 404 });
    }

    const result = await sendText({
      number: phone,
      text: input.text,
      sender: "ADMIN",
      skipBotLog: true,
      flowStage: "CRM_PIPELINE",
    });
    if (
      !result ||
      typeof result !== "object" ||
      ("error" in result && result.error) ||
      ("blocked" in result && result.blocked)
    ) {
      return NextResponse.json({ success: false, error: "A WASender não aceitou a mensagem" }, { status: 502 });
    }

    await logWhatsAppMessage({
      phone,
      sessionId: conversation.id,
      clientId: conversation.clientId,
      direction: MessageDirection.OUTBOUND,
      sender: MessageSender.ADMIN,
      body: input.text,
      flowStage: "CRM_PIPELINE",
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Revise o telefone e a mensagem" }, { status: 400 });
    }
    console.error("[Pipeline POST]", error);
    return NextResponse.json({ success: false, error: "Não foi possível enviar a mensagem" }, { status: 500 });
  }
}
