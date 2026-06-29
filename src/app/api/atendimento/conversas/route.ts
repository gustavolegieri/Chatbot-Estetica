import { NextRequest, NextResponse } from "next/server";
import { HandoffStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseFlowMetadata } from "@/lib/atendimento-analytics";
import { flowStageLabel } from "@/lib/flow-stage-labels";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter") ?? "all";
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const where =
    filter === "handoff"
      ? { handoffStatus: { in: [HandoffStatus.PENDING, HandoffStatus.IN_PROGRESS] } }
      : filter === "unread"
        ? { unreadCount: { gt: 0 } }
        : filter === "active"
          ? { lastMessageAt: { not: null } }
          : {};

  const sessions = await prisma.whatsAppSession.findMany({
    where,
    include: { client: true },
    orderBy: [{ handoffStatus: "asc" }, { lastMessageAt: "desc" }],
    take: 100,
  });

  let list = sessions.map((s) => {
    const flow = parseFlowMetadata(s.metadata);
    return {
      id: s.id,
      phone: s.phone,
      clientId: s.clientId,
      clientName: flow.customerName ?? s.client?.name ?? "Cliente",
      handoffStatus: s.handoffStatus,
      handoffAt: s.handoffAt,
      handoffReason: s.handoffReason,
      botPaused: s.botPaused,
      unreadCount: s.unreadCount,
      lastMessageAt: s.lastMessageAt,
      lastMessagePreview: s.lastMessagePreview,
      flowStage: flow.stage,
      flowStageLabel: flowStageLabel(flow.stage),
      serviceLabel: flow.serviceLabel,
      vehicleRaw: flow.vehicleRaw,
      updatedAt: s.updatedAt,
    };
  });

  if (q) {
    list = list.filter(
      (c) =>
        c.clientName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.lastMessagePreview?.toLowerCase().includes(q) ?? false) ||
        (c.handoffReason?.toLowerCase().includes(q) ?? false)
    );
  }

  return NextResponse.json({ success: true, data: list });
}
