import { MessageDirection, MessageSender } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { goToMainMenu, processNumberedFlow, startFlow } from "./whatsapp-flow";
import { tryHandleAppointmentConfirmation } from "./appointment-confirmation";
import { applySessionResetIfExpired } from "./whatsapp-session-reset";
import { FlowState } from "./whatsapp-flow-types";
import { runWithMessageLogContext } from "./whatsapp-message-context";
import { logWhatsAppMessage } from "./whatsapp-message-log";
import {
  isBotPausedForPhone,
  requestHumanHandoff,
  wantsHumanHandoff,
} from "./whatsapp-handoff";

interface IncomingMessage {
  phone: string;
  text: string;
  buttonId?: string;
  listId?: string;
  pushName?: string;
}

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") {
    return { stage: "ETAPA1_AWAITING_NAME", welcomed: false };
  }
  return raw as FlowState;
}

async function getOrCreateSession(phone: string, pushName?: string) {
  const normalized = normalizePhone(phone);

  let session = await prisma.whatsAppSession.findUnique({
    where: { phone: normalized },
    include: { client: true },
  });

  if (!session) {
    let client = await prisma.client.findUnique({ where: { phone: normalized } });
    if (!client && pushName) {
      client = await prisma.client.create({
        data: { name: pushName, phone: normalized },
      });
    }

    session = await prisma.whatsAppSession.create({
      data: {
        phone: normalized,
        clientId: client?.id,
        metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: false } as object,
      },
      include: { client: true },
    });
  }

  return session;
}

async function handleMessage(msg: IncomingMessage) {
  if (!isValidPrivateRecipient(msg.phone)) {
    console.warn("[WhatsApp Bot] Ignorado (não é chat privado):", msg.phone);
    return;
  }

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (settings && settings.whatsappEnabled === false) {
    console.warn("[WhatsApp Bot] whatsappEnabled=false nas configurações, mensagem ignorada");
    return;
  }

  const session = await getOrCreateSession(msg.phone, msg.pushName);
  let flow = parseFlow(session.metadata);
  const flowRef = { current: flow };

  await runWithMessageLogContext(
    {
      phone: msg.phone,
      sessionId: session.id,
      clientId: session.clientId,
      getStage: () => flowRef.current.stage,
    },
    async () => {
      const inboundText = msg.text.trim() || msg.buttonId || msg.listId || "";

      if (inboundText) {
        await logWhatsAppMessage({
          phone: msg.phone,
          sessionId: session.id,
          clientId: session.clientId,
          direction: MessageDirection.INBOUND,
          sender: MessageSender.CLIENT,
          body: inboundText,
          flowStage: flowRef.current.stage,
        });
      }

      if (wantsHumanHandoff(inboundText)) {
        const name =
          flowRef.current.customerName ?? session.client?.name ?? msg.pushName;
        await requestHumanHandoff({
          phone: msg.phone,
          sessionId: session.id,
          reason: inboundText,
          clientName: name,
        });
        return;
      }

      if (await isBotPausedForPhone(msg.phone)) {
        return;
      }

      await applySessionResetIfExpired(msg.phone, session.updatedAt, flowRef.current);

      const sessionAfterReset = await prisma.whatsAppSession.findUnique({
        where: { phone: normalizePhone(msg.phone) },
        include: { client: true },
      });
      flowRef.current = parseFlow(sessionAfterReset?.metadata);
      flow = flowRef.current;

      if (await tryHandleAppointmentConfirmation(msg.phone, msg.text)) return;

      if (msg.text.trim().toLowerCase() === "menu") {
        const name =
          flowRef.current.customerName ?? session.client?.name ?? msg.pushName ?? "Cliente";
        await goToMainMenu(msg.phone, name);
        return;
      }

      if (!flowRef.current.welcomed) {
        await startFlow(msg);
        return;
      }

      await processNumberedFlow(msg, flowRef.current);
    }
  );
}

export async function processWhatsAppMessage(msg: IncomingMessage) {
  await handleMessage(msg);
}
