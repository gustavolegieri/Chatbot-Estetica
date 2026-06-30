import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { sendWelcomeFlow } from "./whatsapp-welcome";
import { getFollowupIdleMs, getSessionResetMs } from "./settings-runtime";
import { FlowState } from "./whatsapp-flow-types";
import { resolveValidCustomerName } from "./customer-name";

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") return { stage: "ETAPA2_MAIN_MENU" };
  return raw as FlowState;
}

/** Recuperação de clientes que pararam de responder — reenvia boas-vindas */
export async function sendIdleSessionRecoveries() {
  const [sessionResetMs, recoveryIdleMs] = await Promise.all([
    getSessionResetMs(),
    getFollowupIdleMs(),
  ]);
  const now = Date.now();
  const minIdle = new Date(now - recoveryIdleMs);
  const maxIdle = new Date(now - sessionResetMs);

  const sessions = await prisma.whatsAppSession.findMany({
    where: {
      step: WhatsAppSessionStep.IDLE,
      botPaused: false,
      updatedAt: { gte: maxIdle, lte: minIdle },
    },
    include: { client: true },
  });

  let sent = 0;
  for (const session of sessions) {
    const meta = parseFlow(session.metadata) as FlowState & { recoverySent?: boolean };
    if (meta.recoverySent) continue;

    const name =
      resolveValidCustomerName(meta.customerName) ??
      resolveValidCustomerName(session.client?.name);
    await sendWelcomeFlow(session.phone, name);
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        metadata: { ...buildRecoveryMeta(meta, name), recoverySent: true },
      },
    });
    sent++;
  }

  return { sent, checked: sessions.length };
}

function buildRecoveryMeta(meta: FlowState, name: string | null): FlowState {
  if (name) {
    return { stage: "ETAPA2_MAIN_MENU", welcomed: true, customerName: name };
  }
  return { stage: "ETAPA1_AWAITING_NAME", welcomed: true };
}
