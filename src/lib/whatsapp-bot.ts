import { MessageDirection, MessageSender } from "./message-enums";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { goToMainMenu, processNumberedFlow, startFlow } from "./whatsapp-flow";
import { enqueueWhatsAppMessage } from "./whatsapp-debounce";
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

async function handleMessageInternal(msg: IncomingMessage) {
  console.log("[WhatsApp Bot] 📱 Mensagem recebida:", { phone: msg.phone, text: msg.text, buttonId: msg.buttonId, listId: msg.listId, pushName: msg.pushName });

  if (!isValidPrivateRecipient(msg.phone)) {
    console.warn("[WhatsApp Bot] ⛔ Ignorado (não é chat privado):", msg.phone);
    return;
  }

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (settings && settings.whatsappEnabled === false) {
    console.warn("[WhatsApp Bot] ⛔ whatsappEnabled=false nas configurações, mensagem ignorada");
    return;
  }

  console.log("[WhatsApp Bot] ✅ WhatsApp habilitado nas configurações");

  runAppointmentRemindersFromBot();

  const session = await getOrCreateSession(msg.phone, msg.pushName);
  console.log("[WhatsApp Bot] 📦 Sessão criada/encontrada:", { sessionId: session.id, phone: session.phone, clientId: session.clientId });

  let flow = parseFlow(session.metadata);
  const flowRef = { current: flow };
  const lastInteractionAt = session.lastMessageAt ?? session.updatedAt;

  console.log("[WhatsApp Bot] 🔄 Estado atual do fluxo:", { stage: flow.stage, welcomed: flow.welcomed, customerName: flow.customerName });

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
      if (blocked) {
        console.log("[WhatsApp Bot] ⛔ Número bloqueado:", msg.phone);
        return;
      }

      if (await isBotPausedForPhone(msg.phone)) {
        console.log("[WhatsApp Bot] ⛔ Bot pausado para este número:", msg.phone);
        return;
      }

      console.log("[WhatsApp Bot] ✅ Número não bloqueado, bot não pausado");


      if (await tryHandleAppointmentConfirmation(msg.phone, msg.text, flowRef.current.stage)) return;

      if (settings && !getBusinessHoursStatus(settings).isOpen) {
        console.log("[WhatsApp Bot] ⛔ Fora do horário de funcionamento");
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

      console.log("[WhatsApp Bot] ✅ Dentro do horário de funcionamento");

      const wasReset = await applyWelcomeRestartIfNeeded(
        msg.phone,
        lastInteractionAt,
        flowRef.current
      );
      console.log("[WhatsApp Bot] 🔄 wasReset:", wasReset);

      if (wasReset) {
        console.log("[WhatsApp Bot] 🔄 Sessão resetada, enviando boas-vindas");
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

      console.log("[WhatsApp Bot] 🔄 Estado após reset check:", { stage: flowRef.current.stage, welcomed: flowRef.current.welcomed });

      if (msg.text.trim().toLowerCase() === "menu") {
        console.log("[WhatsApp Bot] 📋 Comando 'menu' detectado");
        const name =
          flowRef.current.customerName ?? session.client?.name ?? msg.pushName ?? "Cliente";
        await goToMainMenu(msg.phone, name);
        return;
      }

      if (!flowRef.current.welcomed) {
        console.log("[WhatsApp Bot] 🤖 Cliente não recebeu boas-vindas ainda, iniciando flow");
        await startFlow(msg);
        return;
      }

      console.log("[WhatsApp Bot] 🔄 Processando flow numerado");
      await processNumberedFlow(msg, flowRef.current);
    }
  );
}

export async function processWhatsAppMessage(msg: IncomingMessage) {
  enqueueWhatsAppMessage(
    {
      phone: msg.phone,
      text: msg.text,
      pushName: msg.pushName,
      buttonId: msg.buttonId,
      listId: msg.listId,
    },
    async (merged) => {
      await handleMessageInternal(merged);
    }
  );
}


