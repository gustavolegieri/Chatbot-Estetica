import { MessageDirection, MessageSender } from "./message-enums";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { goToMainMenu, processNumberedFlow, startFlow } from "./whatsapp-flow";
import { tryHandleAppointmentConfirmation } from "./appointment-confirmation";
import { applyWelcomeRestartIfNeeded } from "./whatsapp-session-reset";
import { sendWelcomeFlow } from "./whatsapp-welcome";
import { resolveValidCustomerName } from "./customer-name";
import { getBusinessHoursStatus, afterHoursMessage } from "./business-hours";
import { runAppointmentRemindersFromBot } from "./appointment-reminders-runner";
import { sendText } from "./evolution-api";
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
      const validName = resolveValidCustomerName(pushName);
      if (validName) {
        client = await prisma.client.create({
          data: { name: validName, phone: normalized },
        });
      }
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

  runAppointmentRemindersFromBot();

  const session = await getOrCreateSession(msg.phone, msg.pushName);
  let flow = parseFlow(session.metadata);
  const flowRef = { current: flow };
  const lastInteractionAt = session.lastMessageAt ?? session.updatedAt;

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

      // Bloqueio administrativo de números: evita respostas automáticas do bot
      const blocked = await prisma.blockedPhone.findUnique({
        where: { phone: normalizePhone(msg.phone) },
        select: { id: true },
      });
      if (blocked) return;

      if (await isBotPausedForPhone(msg.phone)) {
        return;
      }


      if (await tryHandleAppointmentConfirmation(msg.phone, msg.text, flowRef.current.stage)) return;

      if (settings && !getBusinessHoursStatus(settings).isOpen) {
        const name =
          resolveValidCustomerName(flowRef.current.customerName) ??
          resolveValidCustomerName(session.client?.name) ??
          resolveValidCustomerName(msg.pushName);
        const status = getBusinessHoursStatus(settings);
        await sendText({
          number: msg.phone,
          text: afterHoursMessage(settings, name, status),
          flowStage: "AFTER_HOURS",
        });
        return;
      }

      const wasReset = await applyWelcomeRestartIfNeeded(
        msg.phone,
        lastInteractionAt,
        flowRef.current
      );
      if (wasReset) {
        const refreshed = await prisma.whatsAppSession.findUnique({
          where: { phone: normalizePhone(msg.phone) },
          include: { client: true },
        });
        const name =
          resolveValidCustomerName(refreshed?.client?.name) ??
          resolveValidCustomerName(msg.pushName);
        await sendWelcomeFlow(msg.phone, name);
        return;
      }

      const sessionAfterReset = await prisma.whatsAppSession.findUnique({
        where: { phone: normalizePhone(msg.phone) },
        include: { client: true },
      });
      flowRef.current = parseFlow(sessionAfterReset?.metadata);
      flow = flowRef.current;

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
