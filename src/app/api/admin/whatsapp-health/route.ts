import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getCerebrasStatus, isCerebrasConfigured } from "@/lib/cerebras-ai";
import { voiceRepliesEnabled } from "@/lib/whatsapp-voice";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const staleLockBefore = new Date(now - 60 * 1000);

  // Keep this summary light: the same information used to run 16 database
  // round-trips per poll, competing with live webhook processing.
  const [settings, queueRows, sessionRows, dayMessages, dedupProtected, lastInbound, lastOutbound] = await prisma.$transaction([
    prisma.settings.findUnique({
      where: { id: "default" },
      select: { whatsappEnabled: true, testModeEnabled: true, testModePhone: true },
    }),
    prisma.outboundMessageQueue.findMany({
      where: {
        OR: [
          { processedAt: null },
          { processedAt: { gte: dayAgo }, error: { not: null } },
        ],
      },
      select: { processedAt: true, isDailyLimit: true, attempts: true, error: true, scheduledFor: true },
    }),
    prisma.whatsAppSession.findMany({
      where: {
        OR: [
          { processingLockedAt: { not: null } },
          { handoffStatus: { in: ["PENDING", "IN_PROGRESS"] } },
        ],
      },
      select: { processingLockedAt: true, handoffStatus: true },
    }),
    prisma.whatsAppMessage.findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { direction: true, createdAt: true },
    }),
    prisma.whatsAppMessage.count({
      where: { direction: "INBOUND", flowStage: "WEBHOOK_DEDUP", createdAt: { gte: dayAgo } },
    }),
    prisma.whatsAppMessage.findFirst({
      where: { direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.whatsAppMessage.findFirst({
      where: { direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const pendingRows = queueRows.filter((row) => row.processedAt === null);
  const pendingQueue = pendingRows.filter((row) => !row.isDailyLimit).length;
  const retryingQueue = pendingRows.filter((row) => !row.isDailyLimit && row.attempts > 0).length;
  const dailyLimitQueue = pendingRows.filter((row) => row.isDailyLimit).length;
  const recentDeliveryErrors = queueRows.filter((row) => row.processedAt && row.error).length;
  const oldestPending = pendingRows
    .filter((row) => !row.isDailyLimit)
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];
  const activeLocks = sessionRows.filter((row) => row.processingLockedAt && row.processingLockedAt >= staleLockBefore).length;
  const staleLocks = sessionRows.filter((row) => row.processingLockedAt && row.processingLockedAt < staleLockBefore).length;
  const pendingHandoffs = sessionRows.filter((row) => row.handoffStatus === "PENDING" || row.handoffStatus === "IN_PROGRESS").length;
  const inboundDay = dayMessages.filter((row) => row.direction === "INBOUND").length;
  const outboundDay = dayMessages.filter((row) => row.direction === "OUTBOUND").length;
  const inboundHour = dayMessages.filter((row) => row.direction === "INBOUND" && row.createdAt >= hourAgo).length;
  const outboundHour = dayMessages.filter((row) => row.direction === "OUTBOUND" && row.createdAt >= hourAgo).length;

  const aiStatus = getCerebrasStatus();
  const integrations = {
    wasender: Boolean(process.env.WASENDER_API_KEY?.trim()),
    cerebras: isCerebrasConfigured(),
    ollama: aiStatus.localConfigured,
    aiProvider: aiStatus.provider,
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    voice: voiceRepliesEnabled(),
  };

  const critical = !settings?.whatsappEnabled || !integrations.wasender || dailyLimitQueue > 0;
  const warning = pendingQueue > 5 || staleLocks > 0 || !integrations.cerebras;
  const status = critical ? "critical" : warning ? "warning" : "healthy";

  return NextResponse.json({
    success: true,
    data: {
      status,
      whatsappEnabled: settings?.whatsappEnabled ?? false,
      testMode: {
        enabled: settings?.testModeEnabled ?? false,
        phone: settings?.testModePhone ?? null,
      },
      integrations,
      queue: {
        pending: pendingQueue,
        retrying: retryingQueue,
        dailyLimit: dailyLimitQueue,
        errors24h: recentDeliveryErrors,
        oldestPendingAt: oldestPending?.scheduledFor ?? null,
      },
      processing: {
        activeLocks,
        staleLocks,
        dedupProtected,
        pendingHandoffs,
      },
      traffic: {
        inboundHour,
        outboundHour,
        inboundDay,
        outboundDay,
        lastInboundAt: lastInbound?.createdAt ?? null,
        lastOutboundAt: lastOutbound?.createdAt ?? null,
      },
    },
  });
}
