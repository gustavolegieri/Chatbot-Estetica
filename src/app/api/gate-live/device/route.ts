import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gateDeviceAuthorized } from "@/lib/gate-device-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const answerSchema = z.object({
  sessionId: z.string().min(8).max(80),
  deviceId: z.string().min(2).max(80),
  answer: z.object({
    type: z.literal("answer"),
    sdp: z.string().min(20).max(250_000),
  }),
});

export async function GET(request: NextRequest) {
  if (!gateDeviceAuthorized(request)) return NextResponse.json({ success: false, error: "Dispositivo não autorizado" }, { status: 401 });
  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  if (!deviceId || deviceId.length > 80) return NextResponse.json({ success: false, error: "deviceId inválido" }, { status: 400 });
  const sessions = await prisma.gateLiveSession.findMany({
    where: { deviceId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true, offer: true, answer: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 4,
  });
  return NextResponse.json({
    success: true,
    data: {
      activeSessionIds: sessions.map((item) => item.id),
      sessions: sessions.filter((item) => item.offer && !item.answer),
    },
  });
}

export async function POST(request: NextRequest) {
  if (!gateDeviceAuthorized(request)) return NextResponse.json({ success: false, error: "Dispositivo não autorizado" }, { status: 401 });
  const parsed = answerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Resposta WebRTC inválida" }, { status: 400 });
  const session = await prisma.gateLiveSession.findFirst({
    where: { id: parsed.data.sessionId, deviceId: parsed.data.deviceId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!session) return NextResponse.json({ success: false, error: "Sessão não encontrada ou encerrada" }, { status: 404 });
  await prisma.gateLiveSession.update({
    where: { id: session.id },
    data: { answer: parsed.data.answer },
  });
  return NextResponse.json({ success: true });
}
