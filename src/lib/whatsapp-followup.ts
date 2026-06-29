import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { loadPromptMap, renderPrompt } from "./bot-prompts";
import { getFollowupIdleMs, getSessionResetMs } from "./settings-runtime";
import { FlowState } from "./whatsapp-flow-types";

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") return { stage: "ETAPA2_MAIN_MENU" };
  return raw as FlowState;
}

/** Lembrete leve só para quem parou há X min (configurável no admin). */
async function buildRecoveryMessage(meta: FlowState): Promise<string> {
  const prompts = await loadPromptMap();
  const name = meta.customerName ? `, *${meta.customerName}*` : ``;
  return renderPrompt(prompts, "followup_recovery", { name });
}

/** Recuperação de clientes que pararam de responder (chamar via cron a cada 5–10 min) */
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
      updatedAt: { gte: maxIdle, lte: minIdle },
    },
  });

  let sent = 0;
  for (const session of sessions) {
    const meta = parseFlow(session.metadata) as FlowState & { recoverySent?: boolean };
    if (meta.recoverySent) continue;

    await sendText({
      number: session.phone,
      text: await buildRecoveryMessage(meta),
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
