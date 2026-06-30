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
  const valid = resolveValidCustomerName(customerName);
  if (valid) {
    return {
      stage: "ETAPA2_MAIN_MENU",
      welcomed: true,
      customerName: valid,
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

/** Marca que a próxima mensagem do cliente deve receber boas-vindas (ex.: após encerrar handoff). */
export async function markPendingWelcomeRestart(phone: string, customerName?: string | null) {
  const fresh = buildFreshFlowState(customerName ?? undefined);
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
 * Reinicia atendimentos parados há mais de X min e envia boas-vindas.
 * Chamar no cron a cada 5–10 min.
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
    const name = resolveValidCustomerName(meta.customerName) ?? resolveValidCustomerName(session.client?.name);
    const fresh = buildFreshFlowState(name ?? undefined);
    const alreadyFresh =
      meta.stage === fresh.stage &&
      meta.welcomed === fresh.welcomed &&
      !meta.pendingWelcomeRestart &&
      !meta.serviceKey &&
      !meta.vehicleRaw &&
      !meta.resumeStage;

    if (alreadyFresh) continue;

    await sendWelcomeFlow(session.phone, name);
    reset++;
  }

  return { reset, checked: sessions.length };
}

/**
 * Ao receber mensagem: reinicia se atendimento foi encerrado ou sessão expirou.
 * Usa lastInteractionAt *antes* de registrar a mensagem atual.
 */
export async function applyWelcomeRestartIfNeeded(
  phone: string,
  lastInteractionAt: Date,
  current: FlowState
): Promise<boolean> {
  const expired = await isSessionExpired(lastInteractionAt);
  if (!shouldRestartWithWelcome(lastInteractionAt, current, expired)) return false;

  const client = await prisma.client.findUnique({
    where: { phone: normalizePhone(phone) },
  });
  const name =
    resolveValidCustomerName(current.customerName) ?? resolveValidCustomerName(client?.name);
  await saveFreshFlow(phone, name ?? undefined);
  return true;
}

/** @deprecated Use applyWelcomeRestartIfNeeded */
export async function applySessionResetIfExpired(
  phone: string,
  lastInteractionAt: Date,
  current: FlowState
): Promise<boolean> {
  return applyWelcomeRestartIfNeeded(phone, lastInteractionAt, current);
}
