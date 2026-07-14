import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { getSessionResetMs } from "./settings-runtime";
import { FlowState } from "./whatsapp-flow-types";
import { sendWelcomeFlow } from "./whatsapp-welcome";
import { resolveValidCustomerName } from "./customer-name";

export async function isSessionExpired(lastInteractionAt: Date): Promise<boolean> {
  const ms = await getSessionResetMs();
  return Date.now() - lastInteractionAt.getTime() >= ms;
}

/** Estado limpo — sem veículo, serviço ou etapa anterior */
export function buildFreshFlowState(customerName?: string): FlowState {
  // Sempre reinicia do zero após expiração de sessão (30 minutos)
  return {
    stage: "ETAPA1_AWAITING_NAME",
    welcomed: false,
  };
}

export async function saveFreshFlow(phone: string) {
  const fresh = buildFreshFlowState();
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: {
      metadata: fresh as object,
      step: WhatsAppSessionStep.IDLE,
    },
  });
  return fresh;
}

/** Marca que a próxima mensagem do cliente deve receber boas-vindas (ex.: após encerrar handoff). */
export async function markPendingWelcomeRestart(phone: string, customerName?: string | null) {
  const fresh = buildFreshFlowState();
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: {
      metadata: { ...fresh, pendingWelcomeRestart: true } as object,
      step: WhatsAppSessionStep.IDLE,
    },
  });
}

export function shouldRestartWithWelcome(
  lastInteractionAt: Date,
  flow: FlowState,
  expired: boolean
): boolean {
  return flow.pendingWelcomeRestart === true || expired;
}

/**
 * Reinicia atendimentos parados há mais de X min (apenas estado interno).
 * NÃO envia boas-vindas automaticamente - isso só acontece quando o cliente interage.
 * Chamar no cron a cada 5–10 min.
 * Sempre reinicia do zero após 30 minutos de inatividade.
 */
export async function resetAllExpiredSessions(): Promise<{ reset: number; checked: number }> {
  const sessionResetMs = await getSessionResetMs();
  const cutoff = new Date(Date.now() - sessionResetMs);
  const sessions = await prisma.whatsAppSession.findMany({
    where: {
      botPaused: false,
      OR: [{ lastMessageAt: { lt: cutoff } }, { lastMessageAt: null, updatedAt: { lt: cutoff } }],
    },
    include: { client: true },
  });

  let reset = 0;
  for (const session of sessions) {
    const meta = (session.metadata ?? {}) as unknown as FlowState;
    const fresh = buildFreshFlowState();
    const alreadyFresh =
      meta.stage === fresh.stage &&
      meta.welcomed === fresh.welcomed &&
      !meta.pendingWelcomeRestart &&
      !meta.serviceKey &&
      !meta.vehicleRaw &&
      !meta.resumeStage;

    if (alreadyFresh) continue;

    // Apenas reseta o estado interno, sem enviar mensagem
    await saveFreshFlow(session.phone);
    reset++;
  }

  return { reset, checked: sessions.length };
}

/**
 * Ao receber mensagem: reinicia se atendimento foi encerrado ou sessão expirou.
 * Usa lastInteractionAt *antes* de registrar a mensagem atual.
 * Sempre reinicia do zero após 30 minutos de inatividade.
 * Retorna true se deve enviar boas-vindas (caso contrário, apenas reseta estado).
 */
export async function applyWelcomeRestartIfNeeded(
  phone: string,
  lastInteractionAt: Date,
  current: FlowState
): Promise<{ shouldSendWelcome: boolean; wasReset: boolean }> {
  const expired = await isSessionExpired(lastInteractionAt);
  if (!shouldRestartWithWelcome(lastInteractionAt, current, expired)) {
    return { shouldSendWelcome: false, wasReset: false };
  }

  // Sempre reinicia do zero, sem recuperar nome anterior
  await saveFreshFlow(phone);
  
  // Se expirou por tempo, retorna true para enviar boas-vindas
  // Se é por handoff pendente, também envia boas-vindas
  return { shouldSendWelcome: true, wasReset: true };
}
