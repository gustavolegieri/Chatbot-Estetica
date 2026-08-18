import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  getGateVisionReport,
  processGateVisionEvent,
  recordGateHeartbeat,
  simulateGateVision,
} from "@/lib/gate-vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const eventSchema = z.object({
  action: z.literal("gate_event"),
  eventId: z.string().min(8).max(120),
  deviceId: z.string().min(2).max(80),
  type: z.enum(["ENTER", "EXIT"]),
  capturedAt: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1),
  plate: z.string().max(12).optional(),
  plateConfidence: z.number().min(0).max(1).optional(),
  trackId: z.string().max(80).optional(),
  snapshotDataUrl: z.string().max(3_500_000).optional(),
  timelapseDataUrl: z.string().max(3_500_000).optional(),
});

const heartbeatSchema = z.object({
  action: z.literal("heartbeat"),
  eventId: z.string().min(8).max(120),
  deviceId: z.string().min(2).max(80),
  capturedAt: z.string().datetime().optional(),
  cameraName: z.string().max(120).optional(),
  fps: z.number().min(0).max(120).optional(),
  model: z.string().max(120).optional(),
  width: z.number().int().min(1).max(7680).optional(),
  height: z.number().int().min(1).max(4320).optional(),
});

function timingSafeToken(provided: string, configured: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(configured);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function deviceAuthorized(request: NextRequest) {
  const configured = process.env.GATE_VISION_DEVICE_TOKEN?.trim();
  if (!configured) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const custom = request.headers.get("x-gate-vision-token")?.trim();
  const provided = custom || bearer || "";
  return Boolean(provided && timingSafeToken(provided, configured));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await getGateVisionReport() });
  } catch (error) {
    console.error("[Gate Vision] Falha ao carregar relatório", error);
    return NextResponse.json({ success: false, error: "Não foi possível carregar o Portão IA" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });

  if (body.action === "simulate") {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    return NextResponse.json({ success: true, data: simulateGateVision() });
  }

  if (!deviceAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Agente de câmera não autorizado" }, { status: 401 });
  }

  try {
    if (body.action === "gate_event") {
      const input = eventSchema.parse(body);
      return NextResponse.json({ success: true, data: await processGateVisionEvent(input) });
    }
    if (body.action === "heartbeat") {
      const input = heartbeatSchema.parse(body);
      return NextResponse.json({ success: true, data: await recordGateHeartbeat(input) });
    }
    return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Leitura inválida", details: error.flatten() }, { status: 400 });
    }
    console.error("[Gate Vision] Erro ao processar leitura", error);
    return NextResponse.json({ success: false, error: "Falha ao processar a leitura da câmera" }, { status: 500 });
  }
}
