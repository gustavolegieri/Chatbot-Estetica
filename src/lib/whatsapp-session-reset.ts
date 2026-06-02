import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { FlowState, SESSION_RESET_MS } from "./whatsapp-flow-types";

export function isSessionExpired(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() >= SESSION_RESET_MS;
}

/** Estado limpo — sem veículo, serviço ou etapa anterior */
export function buildFreshFlowState(customerName?: string): FlowState {
  if (customerName?.trim()) {
    return {
      stage: "ETAPA2_MAIN_MENU",
      welcomed: true,
      customerName: customerName.trim(),
    };
  }
  return {
    stage: "ETAPA1_AWAITING_NAME",
    welcomed: false,
  };
}

export async function saveFreshFlow(phone: string, customerName?: string) {
  const fresh = buildFreshFlowState(customerName);
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: {
      metadata: fresh as object,
      step: WhatsAppSessionStep.IDLE,
    },
  });
  return fresh;
}

/**
 * Reinicia atendimentos parados há mais de 1h (sem enviar mensagem).
 * Chamar no cron a cada hora e ao receber mensagem.
 */
export async function resetAllExpiredSessions(): Promise<{ reset: number; checked: number }> {
  const cutoff = new Date(Date.now() - SESSION_RESET_MS);
  const sessions = await prisma.whatsAppSession.findMany({
    where: { updatedAt: { lt: cutoff } },
    include: { client: true },
  });

  let reset = 0;
  for (const session of sessions) {
    const meta = (session.metadata ?? {}) as unknown as FlowState;
    const name = meta.customerName ?? session.client?.name;
    const fresh = buildFreshFlowState(name);
    const alreadyFresh =
      meta.stage === fresh.stage &&
      meta.welcomed === fresh.welcomed &&
      !meta.serviceKey &&
      !meta.vehicleRaw &&
      !meta.resumeStage;

    if (alreadyFresh) continue;

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        metadata: fresh as object,
        step: WhatsAppSessionStep.IDLE,
      },
    });
    reset++;
  }

  return { reset, checked: sessions.length };
}

/** Ao receber mensagem após 1h+ sem resposta: reinicia silenciosamente (sem “você estava em atendimento”). */
export async function applySessionResetIfExpired(
  phone: string,
  updatedAt: Date,
  current: FlowState
): Promise<boolean> {
  if (!isSessionExpired(updatedAt)) return false;

  const client = await prisma.client.findUnique({
    where: { phone: normalizePhone(phone) },
  });
  const name = current.customerName ?? client?.name;
  await saveFreshFlow(phone, name);
  return true;
}
