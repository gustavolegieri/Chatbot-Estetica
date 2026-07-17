import EventEmitter from "events";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";

type ProcessorOptions = { concurrency?: number; delayMs?: number };

const globalAny: any = global as any;
if (!globalAny.__campaignProcessors) globalAny.__campaignProcessors = new Map<string, any>();

export function getCampaignEmitter(id: string): EventEmitter {
  if (!globalAny.__campaignEmitters) globalAny.__campaignEmitters = new Map<string, EventEmitter>();
  if (!globalAny.__campaignEmitters.has(id)) globalAny.__campaignEmitters.set(id, new EventEmitter());
  return globalAny.__campaignEmitters.get(id);
}

export async function startCampaignProcessing(campaignId: string, opts: ProcessorOptions = {}) {
  const concurrency = Math.max(1, Math.min(5, opts.concurrency ?? 2));
  const delayMs = opts.delayMs ?? 3000;

  if (globalAny.__campaignProcessors.has(campaignId)) {
    return; // already running
  }

  const emitter = getCampaignEmitter(campaignId);
  globalAny.__campaignProcessors.set(campaignId, true);

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });

  let stopRequested = false;

  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (!stopRequested) {
        // Check campaign status
        const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!camp || camp.status === "PAUSED") break;

        // select one pending item
        const next = await prisma.campaignQueue.findFirst({ where: { campaignId, status: "PENDING" }, orderBy: { queuedAt: "asc" } });
        if (!next) break; // none left

        // try to claim atomically
        const claimed = await prisma.campaignQueue.updateMany({ where: { id: next.id, status: "PENDING" }, data: { status: "SENDING", attempts: { increment: 1 } } });
        if (claimed.count === 0) continue; // lost race

        try {
          // Bloqueio: números que não devem receber mensagens automáticas
          const blocked = await prisma.blockedPhone.findUnique({
            where: { phone: next.phone },
            select: { id: true },
          });

          if (blocked) {
            await prisma.campaignQueue.update({
              where: { id: next.id },
              data: {
                status: "FAILED",
                lastError: "blocked_phone",
              },
            });
            emitter.emit("progress", { campaignId, id: next.id, status: "FAILED", error: "blocked_phone" });
            continue;
          }

          const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
          const messageTemplate = campaign?.message ?? "";
          const message = messageTemplate.replace(/\{name\}/g, next.name ?? "Cliente");
          const res = await sendText({ number: next.phone, text: message, sender: "ADMIN" });

          await prisma.campaignQueue.update({ where: { id: next.id }, data: { status: "SENT", sentAt: new Date() } });
          await prisma.campaign.update({ where: { id: campaignId }, data: { successCount: { increment: 1 } } });
          emitter.emit("progress", { campaignId, id: next.id, status: "SENT" });
        } catch (err: any) {
          const lastError = String(err?.message ?? err ?? "unknown");
          await prisma.campaignQueue.update({ where: { id: next.id }, data: { status: "FAILED", lastError } });
          await prisma.campaign.update({ where: { id: campaignId }, data: { failCount: { increment: 1 } } });
          emitter.emit("progress", { campaignId, id: next.id, status: "FAILED", error: lastError });
        }

        // configurable delay between sends
        await new Promise((r) => setTimeout(r, delayMs));
      }
    })());
  }

  await Promise.all(workers);

  // mark completed if no pending left
  const remaining = await prisma.campaignQueue.count({ where: { campaignId, status: "PENDING" } });
  if (remaining === 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED" } });
    emitter.emit("done", { campaignId });
  } else {
    // if stopped early due to pause, leave as PAUSED
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (camp?.status === "RUNNING") {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    }
  }

  globalAny.__campaignProcessors.delete(campaignId);
}

export async function pauseCampaign(campaignId: string) {
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
}

export async function resumeCampaign(campaignId: string, opts: ProcessorOptions = {}) {
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!camp) throw new Error("Campaign not found");
  if (camp.status === "RUNNING") return;
  await startCampaignProcessing(campaignId, opts);
}

export function isProcessing(campaignId: string) {
  return globalAny.__campaignProcessors.has(campaignId);
}
