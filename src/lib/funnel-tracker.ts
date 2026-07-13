/**
 * Sistema de Rastreamento de Funil de Conversão
 * Rastreia onde clientes abandonam o fluxo de agendamento
 */

import { prisma } from "./prisma";
import { botLogger } from "./structured-logger";

export interface FunnelStep {
  stage: string;
  timestamp: string;
  durationFromStart?: number; // ms desde o início
}

export interface FunnelData {
  sessionId: string;
  phone: string;
  startedAt: string;
  currentStage: string;
  steps: FunnelStep[];
  abandonedAt?: string;
  abandonmentStage?: string;
  abandonmentReason?: string;
}

const FUNNEL_STAGES = [
  "ETAPA1_AWAITING_NAME",
  "ETAPA2_MAIN_MENU",
  "ETAPA3_SERVICE_SELECTION",
  "ETAPA4_VEHICLE_INFO",
  "ETAPA5_QUOTE",
  "ETAPA6_UPSELL",
  "ETAPA7_SCHEDULING",
  "ETAPA8_PAYMENT",
  "ETAPA8_RECEIPT_UPLOAD",
  "ETAPA14_REMINDER",
  "ETAPA15_SUMMARY_CONFIRM",
  "COMPLETED",
] as const;

type FunnelStage = typeof FUNNEL_STAGES[number];

/**
 * Registra início do funil de conversão
 */
export async function startFunnel(sessionId: string, phone: string) {
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone },
    });

    if (!session) {
      await prisma.whatsAppSession.create({
        data: {
          phone,
          funnelSteps: {
            startedAt: new Date().toISOString(),
            steps: [{ stage: "ETAPA1_AWAITING_NAME", timestamp: new Date().toISOString() }],
          },
        },
      });
    } else {
      await prisma.whatsAppSession.update({
        where: { phone },
        data: {
          funnelSteps: {
            startedAt: new Date().toISOString(),
            steps: [{ stage: "ETAPA1_AWAITING_NAME", timestamp: new Date().toISOString() }],
          },
          abandonmentStage: null,
          abandonmentReason: null,
          abandonmentAt: null,
        },
      });
    }

    botLogger.info("Funil iniciado", { sessionId, phone });
  } catch (error) {
    botLogger.error("Erro ao iniciar funil", error as Error, { sessionId, phone });
  }
}

/**
 * Registra progresso no funil
 */
export async function trackFunnelProgress(sessionId: string, phone: string, newStage: string) {
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone },
    });

    if (!session) return;

    const funnelData = session.funnelSteps as any || {};
    const steps = funnelData.steps || [];
    const startedAt = funnelData.startedAt || session.createdAt.toISOString();

    const newStep: FunnelStep = {
      stage: newStage,
      timestamp: new Date().toISOString(),
      durationFromStart: Date.now() - new Date(startedAt).getTime(),
    };

    steps.push(newStep);

    await prisma.whatsAppSession.update({
      where: { phone },
      data: {
        lastStage: newStage,
        funnelSteps: {
          ...funnelData,
          steps,
        },
      },
    });

    botLogger.debug("Progresso do funil registrado", { sessionId, phone, newStage, stepCount: steps.length });
  } catch (error) {
    botLogger.error("Erro ao rastrear progresso do funil", error as Error, { sessionId, phone, newStage });
  }
}

/**
 * Registra abandono no funil
 */
export async function trackAbandonment(sessionId: string, phone: string, reason: string) {
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone },
    });

    if (!session) return;

    await prisma.whatsAppSession.update({
      where: { phone },
      data: {
        abandonmentStage: session.lastStage || "UNKNOWN",
        abandonmentReason: reason,
        abandonmentAt: new Date().toISOString(),
      },
    });

    botLogger.warn("Abandono registrado", { sessionId, phone, stage: session.lastStage, reason });
  } catch (error) {
    botLogger.error("Erro ao registrar abandono", error as Error, { sessionId, phone, reason });
  }
}

/**
 * Marca funil como concluído
 */
export async function completeFunnel(sessionId: string, phone: string) {
  try {
    await prisma.whatsAppSession.update({
      where: { phone },
      data: {
        abandonmentStage: null,
        abandonmentReason: null,
        abandonmentAt: null,
        lastStage: "COMPLETED",
      },
    });

    botLogger.info("Funil concluído", { sessionId, phone });
  } catch (error) {
    botLogger.error("Erro ao completar funil", error as Error, { sessionId, phone });
  }
}

/**
 * Obtém estatísticas do funil de conversão
 */
export async function getFunnelStats(startDate?: Date, endDate?: Date) {
  try {
    const sessions = await prisma.whatsAppSession.findMany({
      where: {
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      },
    });

    const stats = {
      total: sessions.length,
      completed: 0,
      abandoned: 0,
      byStage: {} as Record<string, number>,
      averageTimeToComplete: 0,
    };

    let totalTime = 0;
    let completedCount = 0;

    for (const session of sessions) {
      if (session.lastStage === "COMPLETED") {
        stats.completed++;
        const funnelData = session.funnelSteps as any || {};
        if (funnelData.startedAt) {
          totalTime += Date.now() - new Date(funnelData.startedAt).getTime();
          completedCount++;
        }
      } else if (session.abandonmentStage) {
        stats.abandoned++;
        stats.byStage[session.abandonmentStage] = (stats.byStage[session.abandonmentStage] || 0) + 1;
      }
    }

    if (completedCount > 0) {
      stats.averageTimeToComplete = totalTime / completedCount;
    }

    return stats;
  } catch (error) {
    botLogger.error("Erro ao obter estatísticas do funil", error as Error);
    return null;
  }
}

/**
 * Busca sessões abandonadas para reengajamento
 */
export async function findAbandonedSessions(hoursThreshold: number = 24) {
  try {
    const thresholdMin = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    const thresholdMax = new Date(Date.now() - 60 * 60 * 1000); // 1 hora atrás

    const abandoned = await prisma.whatsAppSession.findMany({
      where: {
        abandonmentStage: { not: null },
        abandonmentAt: {
          gte: thresholdMin,
          lte: thresholdMax,
        },
      },
      include: {
        client: true,
      },
      orderBy: {
        abandonmentAt: "desc",
      },
      take: 50,
    });

    return abandoned;
  } catch (error) {
    botLogger.error("Erro ao buscar sessões abandonadas", error as Error);
    return [];
  }
}
