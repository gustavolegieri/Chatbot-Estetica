import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVapidKeys } from "@/lib/pwa-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(20).max(1000),
    auth: z.string().min(8).max(500),
  }),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const keys = getVapidKeys();
  return NextResponse.json({ success: true, data: { publicKey: keys?.publicKey ?? null, configured: Boolean(keys) } });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    const input = subscriptionSchema.parse(await request.json());
    const subscription = await prisma.pwaPushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { userId: session.userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
      update: { userId: session.userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: "Inscrição inválida" }, { status: 400 });
    console.error("[PWA Push] Falha ao salvar inscrição", error);
    return NextResponse.json({ success: false, error: "Não foi possível ativar as notificações" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (endpoint) await prisma.pwaPushSubscription.deleteMany({ where: { endpoint, userId: session.userId } });
  return NextResponse.json({ success: true });
}
