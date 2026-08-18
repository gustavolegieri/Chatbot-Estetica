import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findGateLiveSessionByToken } from "@/lib/gate-live";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const offerSchema = z.object({
  type: z.literal("offer"),
  sdp: z.string().min(20).max(250_000),
});

type RouteContext = { params: Promise<{ token: string }> };

function publicSession(session: NonNullable<Awaited<ReturnType<typeof findGateLiveSessionByToken>>>) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt,
    plate: session.plate,
    vehicle: session.appointment.client.vehicleModel,
    clientName: session.appointment.client.name.split(/\s+/)[0] || "Cliente",
    service: session.appointment.service.name,
    answer: session.answer,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const session = await findGateLiveSessionByToken(token);
  if (!session) return NextResponse.json({ success: false, error: "Link de acompanhamento inválido" }, { status: 404 });
  return NextResponse.json({ success: true, data: publicSession(session) });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const session = await findGateLiveSessionByToken(token);
  if (!session) return NextResponse.json({ success: false, error: "Link de acompanhamento inválido" }, { status: 404 });
  if (session.status !== "ACTIVE" || session.expiresAt <= new Date()) {
    return NextResponse.json({ success: false, error: "Este acompanhamento já foi encerrado" }, { status: 410 });
  }
  const parsed = offerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Oferta WebRTC inválida" }, { status: 400 });
  const compatibleOffer = {
    ...parsed.data,
    sdp: parsed.data.sdp.replace(/^(a=candidate:\S+)\s+0\s+/gm, "$1 1 "),
  };
  await prisma.gateLiveSession.update({
    where: { id: session.id },
    data: {
      offer: compatibleOffer,
      answer: Prisma.DbNull,
      lastViewerAt: new Date(),
    },
  });
  return NextResponse.json({ success: true, data: { status: "CONNECTING" } });
}
