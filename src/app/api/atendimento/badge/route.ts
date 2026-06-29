import { NextResponse } from "next/server";
import { HandoffStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const [pendingHandoffs, unreadTotal] = await Promise.all([
    prisma.whatsAppSession.count({
      where: { handoffStatus: { in: [HandoffStatus.PENDING, HandoffStatus.IN_PROGRESS] } },
    }),
    prisma.whatsAppSession.aggregate({ _sum: { unreadCount: true } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      pendingHandoffs,
      unreadTotal: unreadTotal._sum.unreadCount ?? 0,
    },
  });
}
