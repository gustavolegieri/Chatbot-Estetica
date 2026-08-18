import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const LIVE_SESSION_HOURS = 12;

export function hashGateLiveToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function gateLiveBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export async function startGateLiveSession(input: {
  appointmentId: string;
  clientId: string;
  deviceId: string;
  plate: string;
  startedAt?: Date;
}) {
  const now = input.startedAt || new Date();
  await prisma.gateLiveSession.updateMany({
    where: {
      status: "ACTIVE",
      OR: [{ appointmentId: input.appointmentId }, { deviceId: input.deviceId }],
    },
    data: { status: "ENDED", endedAt: now },
  });
  const token = crypto.randomBytes(32).toString("base64url");
  const session = await prisma.gateLiveSession.create({
    data: {
      appointmentId: input.appointmentId,
      clientId: input.clientId,
      deviceId: input.deviceId,
      plate: input.plate,
      tokenHash: hashGateLiveToken(token),
      startedAt: now,
      expiresAt: new Date(now.getTime() + LIVE_SESSION_HOURS * 60 * 60_000),
    },
  });
  return {
    session,
    url: `${gateLiveBaseUrl()}/acompanhar/${token}`,
  };
}

export async function endGateLiveSession(input: {
  appointmentId?: string;
  deviceId?: string;
  plate?: string;
  endedAt?: Date;
}) {
  const filters = [
    input.appointmentId ? { appointmentId: input.appointmentId } : null,
    input.deviceId ? { deviceId: input.deviceId } : null,
    input.plate ? { plate: input.plate } : null,
  ].filter(Boolean) as Array<{ appointmentId?: string; deviceId?: string; plate?: string }>;
  if (!filters.length) return { count: 0 };
  return prisma.gateLiveSession.updateMany({
    where: { status: "ACTIVE", OR: filters },
    data: { status: "ENDED", endedAt: input.endedAt || new Date() },
  });
}

export async function findGateLiveSessionByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) return null;
  const session = await prisma.gateLiveSession.findUnique({
    where: { tokenHash: hashGateLiveToken(token) },
    include: {
      appointment: { include: { client: true, service: true } },
    },
  });
  if (!session) return null;
  if (session.status === "ACTIVE" && session.expiresAt <= new Date()) {
    return prisma.gateLiveSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED", endedAt: new Date() },
      include: { appointment: { include: { client: true, service: true } } },
    });
  }
  return session;
}
