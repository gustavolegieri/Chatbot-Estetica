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
import { wantsToSchedule } from "./whatsapp-intent";

interface IncomingMessage {
  phone: string;
  text: string;
  buttonId?: string;
  listId?: string;
  pushName?: string;
  messageId?: string;
}

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") {
    return { stage: "ETAPA1_AWAITING_NAME", welcomed: false };
  }
  return raw as FlowState;
}

async function saveFlow(phone: string, flow: FlowState) {
  console.log("[WhatsApp Bot] 💾 Salvando estado do fluxo:", { phone, stage: flow.stage, welcomed: flow.welcomed });
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: { metadata: flow as any },
  });
}

async function getOrCreateSession(phone: string, pushName?: string) {
  const normalized = normalizePhone(phone);

  // Otimizado para alto volume: usar upsert em vez de find + create
  let client = await prisma.client.findUnique({ where: { phone: normalized } });
  if (!client && pushName) {
    const validName = resolveValidCustomerName(pushName);
    if (validName) {
      client = await prisma.client.create({
        data: { name: validName, phone: normalized },
      });
    }
  }

  const session = await prisma.whatsAppSession.upsert({
    where: { phone: normalized },
    create: {
      phone: normalized,
      clientId: client?.id,
      metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: false } as object,
    },
    update: {},
    include: { client: true },
  });

  return session;
}

async function handleMessageInternal(msg: IncomingMessage) {
  const callId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[WhatsApp Bot] [${callId}] Processando mensagem:`, { phone: msg.phone, text: msg.text });

  if (!isValidPrivateRecipient(msg.phone)) {
    console.warn("[WhatsApp Bot] Ignorado (não é chat privado):", msg.phone);
    return;
  }

  // Verificar modo de teste (otimizado com cache)
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  
  console.log("[WhatsApp Bot] Configurações carregadas:", {
    whatsappEnabled: settings?.whatsappEnabled,
    testModeEnabled: settings?.testModeEnabled,
    testModePhone: settings?.testModePhone
  });
  
  if (settings?.testModeEnabled) {
    const testPhone = settings.testModePhone?.replace(/\D/g, "");
    const normalizedPhone = msg.phone.replace(/\D/g, "");
    
    if (!testPhone) {
      console.log("[WhatsApp Bot] Modo de teste ativado mas nenhum telefone configurado - ignorando");
      return;
    }
    
    if (normalizedPhone !== testPhone) {
      console.log("[WhatsApp Bot] Modo de teste - mensagem ignorada de telefone não autorizado:", msg.phone);
      return;
    }
    
    console.log("[WhatsApp Bot] Modo de teste - mensagem autorizada de telefone:", msg.phone);
  }

  // Filtro extra anti-fuso: se o servidor estiver em outro fuso, ainda assim garantimos que a checagem
  // de horário use o relógio local do bot (Brasil).
  if (settings && settings.whatsappEnabled === false) {
    console.warn("[WhatsApp Bot] whatsappEnabled=false nas configurações, mensagem ignorada");
    return;
  }
  
  console.log("[WhatsApp Bot] Bot habilitado, processando mensagem de:", msg.phone);

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
      if (blocked) {
        console.log("[WhatsApp Bot] Número bloqueado:", msg.phone);
        return;
      }

      if (await isBotPausedForPhone(msg.phone)) {
        console.log("[WhatsApp Bot] Bot pausado para este número:", msg.phone);
        return;
      }

      if (await tryHandleAppointmentConfirmation(msg.phone, msg.text, flowRef.current.stage)) {
        return;
      }

      const businessStatus = settings ? getBusinessHoursStatus(settings) : { isOpen: true };
      const normalizedPhone = msg.phone.replace(/\D/g, "");
      const envTestMode = process.env.TEST_MODE === "true";
      const settingsTestModeAuthorized =
        settings?.testModeEnabled &&
        !!settings.testModePhone &&
        normalizedPhone === settings.testModePhone.replace(/\D/g, "");
      const bypassBusinessHours = envTestMode || settingsTestModeAuthorized;

      if (bypassBusinessHours) {
        console.log("[WhatsApp Bot] Test mode active - bypassing business hours check");
      }

      if (settings && !businessStatus.isOpen && !bypassBusinessHours) {
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

      // Se o usuário quer agendar, pular todo o processo de reset e ir direto para o menu principal
      if (wantsToSchedule(inboundText, null)) {
        console.log("[WhatsApp Bot] Usuário quer agendar, pulando reset e indo para menu principal");
        const name =
          flowRef.current.customerName ?? session.client?.name ?? msg.pushName ?? "Cliente";
        
        // Forçar o estado para o menu principal
        flowRef.current = {
          stage: "ETAPA2_MAIN_MENU",
          welcomed: true,
          customerName: name
        };
        
        await saveFlow(msg.phone, flowRef.current);
        await goToMainMenu(msg.phone, name);
        return;
      }

      const resetResult = await applyWelcomeRestartIfNeeded(
        msg.phone,
        lastInteractionAt,
        flowRef.current
      );

      if (resetResult.shouldSendWelcome) {
        await sendWelcomeFlow(msg.phone);
        return;
      }

      if (resetResult.wasReset) {
        // Se foi resetado mas não precisa enviar boas-vindas, recarregar o estado
        // Otimizado: usar a sessão já disponível em vez de buscar novamente
        flowRef.current = parseFlow(session.metadata);
        flow = flowRef.current;
      }

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

export async function processWhatsAppMessage(msg: IncomingMessage, waitUntil?: (promise: Promise<unknown>) => void) {
  console.log("[WhatsApp Bot] processWhatsAppMessage chamado:", { phone: msg.phone, text: msg.text });
  // Important: processar por phone serialmente ajuda a evitar respostas "fora de hora"
  return enqueueWhatsAppMessage(
    {
      phone: msg.phone,
      text: msg.text,
      pushName: msg.pushName,
      buttonId: msg.buttonId,
      listId: msg.listId,
    },
    async (merged) => {
      console.log("[WhatsApp Bot] handleMessageInternal sendo chamado via debounce:", { phone: merged.phone, text: merged.text });
      await handleMessageInternal(merged);
    },
    waitUntil // Passa waitUntil para garantir execução do debounce em serverless
  );
}



