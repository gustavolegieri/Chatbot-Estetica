import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { FlowState, SESSION_RESET_MS } from "./whatsapp-flow-types";

const RECOVERY_IDLE_MS = 10 * 60 * 1000;

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") return { stage: "ETAPA2_MAIN_MENU" };
  return raw as FlowState;
}

/** Lembrete leve só para quem parou há 10–60 min (nunca “estava em atendimento” no dia seguinte). */
function buildRecoveryMessage(meta: FlowState): string {
  const name = meta.customerName ? ` *${meta.customerName}*` : ``;
  return [
    `Oi${name}! 😊`,
    ``,
    `Ainda posso te ajudar com nossos serviços. É só responder aqui 🚗✨`,
  ].join("\n");
}

/** Recuperação de clientes que pararam de responder (chamar via cron a cada 5–10 min) */
export async function sendIdleSessionRecoveries() {
  const now = Date.now();
  const minIdle = new Date(now - RECOVERY_IDLE_MS);
  const maxIdle = new Date(now - SESSION_RESET_MS);

  const sessions = await prisma.whatsAppSession.findMany({
    where: {
      step: WhatsAppSessionStep.IDLE,
      updatedAt: { gte: maxIdle, lte: minIdle },
    },
  });

  let sent = 0;
  for (const session of sessions) {
    const meta = parseFlow(session.metadata) as FlowState & { recoverySent?: boolean };
    if (meta.recoverySent) continue;

    await sendText({
      number: session.phone,
      text: buildRecoveryMessage(meta),
    });
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        metadata: { ...meta, recoverySent: true },
      },
    });
    sent++;
  }

  return { sent, checked: sessions.length };
}
