import { NextRequest, NextResponse } from "next/server";
import { HandoffStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseFlowMetadata } from "@/lib/atendimento-analytics";
import { flowStageLabel } from "@/lib/flow-stage-labels";
import { markConversationRead } from "@/lib/whatsapp-message-log";
import { normalizePhone } from "@/lib/utils";
import { markPendingWelcomeRestart } from "@/lib/whatsapp-session-reset";
import { resolveValidCustomerName } from "@/lib/customer-name";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { phone: rawPhone } = await params;
  const phone = normalizePhone(decodeURIComponent(rawPhone));

  const waSession = await prisma.whatsAppSession.findUnique({
    where: { phone },
    include: { client: true },
  });

  if (!waSession) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada" }, { status: 404 });
  }

  const [messages, appointments] = await Promise.all([
    prisma.whatsAppMessage.findMany({
      where: { phone },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    waSession.clientId
      ? prisma.appointment.findMany({
          where: { clientId: waSession.clientId },
          include: { service: true },
          orderBy: { date: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
  ]);

  await markConversationRead(waSession.id);

  const flow = parseFlowMetadata(waSession.metadata);

  return NextResponse.json({
    success: true,
    data: {
      session: {
        id: waSession.id,
        phone: waSession.phone,
        handoffStatus: waSession.handoffStatus,
        handoffAt: waSession.handoffAt,
        handoffReason: waSession.handoffReason,
        handoffNote: waSession.handoffNote,
        botPaused: waSession.botPaused,
        client: waSession.client,
      },
      flow: {
        ...flow,
        stageLabel: flowStageLabel(flow.stage),
      },
      messages,
      appointments,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { phone: rawPhone } = await params;
  const phone = normalizePhone(decodeURIComponent(rawPhone));
  const body = await request.json();
  const action = body.action as string;

  const waSession = await prisma.whatsAppSession.findUnique({
    where: { phone },
    include: { client: true },
  });
  if (!waSession) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada" }, { status: 404 });
  }

  if (action === "assume") {
    const updated = await prisma.whatsAppSession.update({
      where: { id: waSession.id },
      data: { handoffStatus: HandoffStatus.IN_PROGRESS },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "resolve") {
    const flow = parseFlowMetadata(waSession.metadata);
    const clientName =
      resolveValidCustomerName(waSession.client?.name) ??
      resolveValidCustomerName(flow.customerName);

    const updated = await prisma.whatsAppSession.update({
      where: { id: waSession.id },
      data: {
        handoffStatus: HandoffStatus.RESOLVED,
        handoffResolvedAt: new Date(),
        botPaused: false,
        handoffNote: body.note ?? waSession.handoffNote,
      },
    });

    await markPendingWelcomeRestart(phone, clientName);

    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "pause_bot") {
    const updated = await prisma.whatsAppSession.update({
      where: { id: waSession.id },
      data: { botPaused: body.paused === true },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "note") {
    const updated = await prisma.whatsAppSession.update({
      where: { id: waSession.id },
      data: { handoffNote: body.note ?? null },
    });
    return NextResponse.json({ success: true, data: updated });
  }

  return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
}
