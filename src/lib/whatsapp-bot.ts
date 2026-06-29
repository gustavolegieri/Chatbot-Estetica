import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { isValidPrivateRecipient } from "./whatsapp-jid";
import { goToMainMenu, processNumberedFlow, startFlow } from "./whatsapp-flow";
import { tryHandleAppointmentConfirmation } from "./appointment-confirmation";
import { applySessionResetIfExpired } from "./whatsapp-session-reset";
import { FlowState } from "./whatsapp-flow-types";

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
  // Só bloqueia se o campo existir E for explicitamente false
  if (settings && settings.whatsappEnabled === false) {
    console.warn("[WhatsApp Bot] whatsappEnabled=false nas configurações, mensagem ignorada");
    return;
  }

  const session = await getOrCreateSession(msg.phone, msg.pushName);
  let flow = parseFlow(session.metadata);

  await applySessionResetIfExpired(msg.phone, session.updatedAt, flow);

  const sessionAfterReset = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(msg.phone) },
    include: { client: true },
  });
  flow = parseFlow(sessionAfterReset?.metadata);

  if (await tryHandleAppointmentConfirmation(msg.phone, msg.text)) return;

  if (msg.text.trim().toLowerCase() === "menu") {
    const name =
      flow.customerName ?? session.client?.name ?? msg.pushName ?? "Cliente";
    await goToMainMenu(msg.phone, name);
    return;
  }

  if (!flow.welcomed) {
    await startFlow(msg);
    return;
  }

  await processNumberedFlow(msg, flow);
}

export async function processWhatsAppMessage(msg: IncomingMessage) {
  await handleMessage(msg);
}