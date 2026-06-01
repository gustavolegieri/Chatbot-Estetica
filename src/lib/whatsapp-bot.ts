import { WhatsAppSessionStep, AppointmentStatus } from "@prisma/client";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { getAvailableSlots, calculateEndTime } from "./appointments";
import { formatCurrency, normalizePhone } from "./utils";

interface IncomingMessage {
  phone: string;
  text: string;
  buttonId?: string;
  listId?: string;
  pushName?: string;
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
        step: WhatsAppSessionStep.IDLE,
      },
      include: { client: true },
    });
  }

  return session;
}

async function updateSession(
  phone: string,
  data: Partial<{
    step: WhatsAppSessionStep;
    selectedServiceId: string | null;
    selectedDate: string | null;
    selectedTime: string | null;
    pendingAppointmentId: string | null;
    clientId: string | null;
  }>
) {
  return prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data,
  });
}

async function sendMainMenu(phone: string) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const name = settings?.businessName ?? "Estética Automotiva";
  const welcome = settings?.whatsappWelcomeMsg ?? "Como posso ajudar?";

  await sendText({
    number: phone,
    text: [
      `*${name}*`,
      welcome,
      "",
      "1️⃣ Agendar",
      "2️⃣ Meus agendamentos",
      "3️⃣ Cancelar",
      "4️⃣ Reagendar",
      "",
      "Responda com o *número* (1 a 4).",
    ].join("\n"),
  });
}

async function sendMenuHint(phone: string) {
  await sendText({
    number: phone,
    text: "Não entendi. Digite *1*, *2*, *3*, *4* ou *menu* para ver as opções.",
  });
}

async function handleIdle(msg: IncomingMessage, input: string) {
  const action = msg.buttonId ?? input.toLowerCase().trim();

  switch (action) {
    case "agendar":
    case "1":
      await updateSession(msg.phone, { step: WhatsAppSessionStep.CHOOSING_SERVICE });
      await sendServiceList(msg.phone);
      break;
    case "meus_agendamentos":
    case "2":
      await showAppointments(msg.phone);
      break;
    case "cancelar":
    case "3":
      await updateSession(msg.phone, { step: WhatsAppSessionStep.CANCELLING });
      await sendText({
        number: msg.phone,
        text: "Informe o *número* do agendamento que deseja cancelar (veja em Meus agendamentos) ou digite *menu* para voltar.",
      });
      break;
    case "reagendar":
    case "4":
      await updateSession(msg.phone, { step: WhatsAppSessionStep.RESCHEDULING });
      await sendText({
        number: msg.phone,
        text: "Informe o *número* do agendamento que deseja reagendar ou digite *menu* para voltar.",
      });
      break;
    default:
      await sendMenuHint(msg.phone);
  }
}

async function sendServiceList(phone: string, prefix?: string) {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  if (services.length === 0) {
    await sendText({ number: phone, text: "Nenhum serviço disponível no momento." });
    await updateSession(phone, { step: WhatsAppSessionStep.IDLE });
    return;
  }

  const lines = services.map(
    (s, i) => `${i + 1}. *${s.name}* — ${formatCurrency(Number(s.price))} (${s.durationMin} min)`
  );

  const parts = prefix ? [prefix, ""] : [];
  await sendText({
    number: phone,
    text: [...parts, "*Escolha o serviço* (envie o número):", "", ...lines].join("\n"),
  });
}

async function handleChoosingService(msg: IncomingMessage, input: string) {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  let serviceId = msg.listId?.replace("service_", "") ?? input.replace("service_", "");
  const asNumber = parseInt(input.replace(/\D/g, ""), 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= services.length) {
    serviceId = services[asNumber - 1].id;
  }

  const service = await prisma.service.findFirst({
    where: { id: serviceId, active: true },
  });

  if (!service) {
    await sendServiceList(msg.phone, "Opção inválida.");
    return;
  }

  await updateSession(msg.phone, {
    step: WhatsAppSessionStep.CHOOSING_DATE,
    selectedServiceId: service.id,
  });

  const dates = getNextAvailableDates(7);
  const lines = dates.map((d, i) => `${i + 1}. ${d.label}`);

  await sendText({
    number: msg.phone,
    text: [`Serviço: *${service.name}*`, "", "*Escolha a data* (envie o número):", "", ...lines].join("\n"),
  });
}

function getNextAvailableDates(days: number) {
  const result: Array<{ value: string; label: string }> = [];
  const date = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(date);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0) continue;
    result.push({
      value: format(d, "yyyy-MM-dd"),
      label: format(d, "EEEE, dd/MM", { locale: ptBR }),
    });
  }
  return result;
}

async function handleChoosingDate(msg: IncomingMessage, input: string) {
  const dates = getNextAvailableDates(7);
  let dateStr = msg.listId?.replace("date_", "") ?? input.replace("date_", "");
  const asNumber = parseInt(input.replace(/\D/g, ""), 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= dates.length) {
    dateStr = dates[asNumber - 1].value;
  }
  const session = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(msg.phone) },
  });

  if (!session?.selectedServiceId) {
    await updateSession(msg.phone, { step: WhatsAppSessionStep.IDLE });
    await sendMainMenu(msg.phone);
    return;
  }

  const service = await prisma.service.findUnique({
    where: { id: session.selectedServiceId },
  });
  if (!service) return;

  const slots = await getAvailableSlots(dateStr, service.durationMin);

  if (slots.length === 0) {
    await updateSession(msg.phone, { step: WhatsAppSessionStep.CHOOSING_DATE });
    const datesRetry = getNextAvailableDates(7);
    const lines = datesRetry.map((d, i) => `${i + 1}. ${d.label}`);
    await sendText({
      number: msg.phone,
      text: ["Sem horários nesta data. *Escolha outra data* (envie o número):", "", ...lines].join("\n"),
    });
    return;
  }

  await updateSession(msg.phone, {
    step: WhatsAppSessionStep.CHOOSING_TIME,
    selectedDate: dateStr,
  });

  const slotLines = slots.map(
    (s, i) => `${i + 1}. ${s} (até ${calculateEndTime(s, service.durationMin)})`
  );

  await sendText({
    number: msg.phone,
    text: [
      `Data: *${format(parse(dateStr, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}*`,
      "",
      "*Escolha o horário* (envie o número):",
      "",
      ...slotLines,
    ].join("\n"),
  });
}

async function handleChoosingTime(msg: IncomingMessage, input: string) {
  const sessionForSlots = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(msg.phone) },
  });
  const serviceForSlots = sessionForSlots?.selectedServiceId
    ? await prisma.service.findUnique({ where: { id: sessionForSlots.selectedServiceId } })
    : null;
  const slots =
    sessionForSlots?.selectedDate && serviceForSlots
      ? await getAvailableSlots(sessionForSlots.selectedDate, serviceForSlots.durationMin)
      : [];

  let time = msg.listId?.replace("time_", "") ?? input.replace("time_", "");
  const asNumber = parseInt(input.replace(/\D/g, ""), 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= slots.length) {
    time = slots[asNumber - 1];
  }
  const session = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(msg.phone) },
    include: { client: true },
  });

  if (!session?.selectedServiceId || !session.selectedDate || !session.clientId) {
    await sendMainMenu(msg.phone);
    return;
  }

  const service = await prisma.service.findUnique({
    where: { id: session.selectedServiceId },
  });
  if (!service) return;

  await updateSession(msg.phone, {
    step: WhatsAppSessionStep.CONFIRMING,
    selectedTime: time,
  });

  await sendText({
    number: msg.phone,
    text: [
      `📋 *Resumo do agendamento*`,
      ``,
      `👤 Cliente: ${session.client?.name}`,
      `🔧 Serviço: ${service.name}`,
      `📅 Data: ${format(parse(session.selectedDate, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}`,
      `🕐 Horário: ${time}`,
      `💰 Valor: ${formatCurrency(Number(service.price))}`,
      ``,
      `1️⃣ Confirmar`,
      `2️⃣ Cancelar`,
      ``,
      `Responda *1* para confirmar ou *2* para cancelar.`,
    ].join("\n"),
  });
}

async function handleConfirming(msg: IncomingMessage) {
  const action = (msg.buttonId ?? msg.text).toLowerCase().trim();

  if (
    action === "cancelar_agendamento" ||
    action === "2" ||
    action.includes("cancelar")
  ) {
    await updateSession(msg.phone, {
      step: WhatsAppSessionStep.IDLE,
      selectedServiceId: null,
      selectedDate: null,
      selectedTime: null,
    });
    await sendText({
      number: msg.phone,
      text: "Agendamento cancelado. Digite *menu* quando quiser agendar de novo.",
    });
    return;
  }

  if (
    action !== "confirmar_agendamento" &&
    action !== "1" &&
    action !== "sim" &&
    !action.includes("confirmar")
  ) {
    await sendText({
      number: msg.phone,
      text: "Responda *1* para confirmar ou *2* para cancelar o agendamento.",
    });
    return;
  }

  const session = await prisma.whatsAppSession.findUnique({
    where: { phone: normalizePhone(msg.phone) },
  });

  if (!session?.clientId || !session.selectedServiceId || !session.selectedDate || !session.selectedTime) {
    await sendMainMenu(msg.phone);
    return;
  }

  const service = await prisma.service.findUnique({
    where: { id: session.selectedServiceId },
  });
  if (!service) return;

  const appointment = await prisma.appointment.create({
    data: {
      clientId: session.clientId,
      serviceId: service.id,
      date: parse(session.selectedDate, "yyyy-MM-dd", new Date()),
      startTime: session.selectedTime,
      endTime: calculateEndTime(session.selectedTime, service.durationMin),
      status: AppointmentStatus.CONFIRMED,
      source: "whatsapp",
    },
    include: { service: true, client: true },
  });

  await prisma.financialRecord.create({
    data: {
      type: "INCOME",
      category: "SERVICE",
      amount: service.price,
      description: `Agendamento WhatsApp - ${service.name}`,
      appointmentId: appointment.id,
      serviceId: service.id,
    },
  });

  await updateSession(msg.phone, {
    step: WhatsAppSessionStep.IDLE,
    selectedServiceId: null,
    selectedDate: null,
    selectedTime: null,
  });

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  await sendText({
    number: msg.phone,
    text: [
      `✅ *Agendamento confirmado!*`,
      ``,
      `🔖 Código: ${appointment.id.slice(-8).toUpperCase()}`,
      `🔧 ${service.name}`,
      `📅 ${format(appointment.date, "dd/MM/yyyy")} às ${appointment.startTime}`,
      `📍 ${settings?.businessAddress ?? ""}`,
      ``,
      `Obrigado! Nos vemos em breve. 🚗✨`,
      ``,
      `Digite *menu* para outras opções.`,
    ].join("\n"),
  });
}

async function showAppointments(phone: string) {
  const client = await prisma.client.findUnique({
    where: { phone: normalizePhone(phone) },
  });

  if (!client) {
    await sendText({ number: phone, text: "Você ainda não possui agendamentos." });
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: client.id,
      status: { notIn: ["CANCELLED"] },
      date: { gte: new Date() },
    },
    include: { service: true },
    orderBy: { date: "asc" },
    take: 5,
  });

  if (appointments.length === 0) {
    await sendText({
      number: phone,
      text: "Nenhum agendamento futuro. Digite *1* para agendar ou *menu*.",
    });
    return;
  }

  const list = appointments
    .map(
      (a, i) =>
        `${i + 1}. *${a.service.name}*\n   📅 ${format(a.date, "dd/MM/yyyy")} às ${a.startTime}\n   ${translateStatus(a.status)}`
    )
    .join("\n\n");

  await sendText({
    number: phone,
    text: `📋 *Seus agendamentos:*\n\n${list}\n\nPara cancelar ou reagendar, use *3* ou *4* no menu.`,
  });
}

function translateStatus(status: string) {
  const map: Record<string, string> = {
    PENDING: "Pendente",
    CONFIRMED: "Confirmado",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluído",
    CANCELLED: "Cancelado",
    NO_SHOW: "Não compareceu",
  };
  return map[status] ?? status;
}

async function handleCancelling(msg: IncomingMessage, input: string) {
  if (input === "menu") {
    await updateSession(msg.phone, { step: WhatsAppSessionStep.IDLE });
    await sendMainMenu(msg.phone);
    return;
  }

  const client = await prisma.client.findUnique({
    where: { phone: normalizePhone(msg.phone) },
  });
  if (!client) return;

  const appointments = await prisma.appointment.findMany({
    where: { clientId: client.id, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    include: { service: true },
  });

  const search = input.toUpperCase();
  const appointment = appointments.find(
    (a) => a.id.slice(-8).toUpperCase() === search || a.id === input
  );

  if (!appointment) {
    await sendText({
      number: msg.phone,
      text: "Agendamento não encontrado. Verifique o código e tente novamente ou digite *menu*.",
    });
    return;
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  });

  await updateSession(msg.phone, { step: WhatsAppSessionStep.IDLE });

  await sendText({
    number: msg.phone,
    text: `❌ *${appointment.service.name}* em ${format(appointment.date, "dd/MM/yyyy")} foi cancelado. Digite *menu* se precisar.`,
  });
}

async function handleRescheduling(msg: IncomingMessage, input: string) {
  if (input === "menu") {
    await updateSession(msg.phone, { step: WhatsAppSessionStep.IDLE });
    await sendMainMenu(msg.phone);
    return;
  }

  const client = await prisma.client.findUnique({
    where: { phone: normalizePhone(msg.phone) },
  });
  if (!client) return;

  const appointments = await prisma.appointment.findMany({
    where: { clientId: client.id, status: { notIn: ["CANCELLED", "COMPLETED"] } },
  });

  const search = input.toUpperCase();
  const appointment = appointments.find(
    (a) => a.id.slice(-8).toUpperCase() === search || a.id === input
  );

  if (!appointment) {
    await sendText({
      number: msg.phone,
      text: "Agendamento não encontrado. Digite o código correto ou *menu* para voltar.",
    });
    return;
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
  });

  await updateSession(msg.phone, {
    step: WhatsAppSessionStep.CHOOSING_SERVICE,
    pendingAppointmentId: appointment.id,
    selectedServiceId: appointment.serviceId,
  });

  await sendServiceList(msg.phone, "Vamos reagendar! Escolha o serviço:");
}

export async function processWhatsAppMessage(msg: IncomingMessage) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (settings && !settings.whatsappEnabled) return;

  const session = await getOrCreateSession(msg.phone, msg.pushName);
  const input = (msg.buttonId ?? msg.listId ?? msg.text).toLowerCase().trim();

  if (input === "menu" || input === "oi" || input === "olá" || input === "ola") {
    await updateSession(msg.phone, { step: WhatsAppSessionStep.IDLE });
    await sendMainMenu(msg.phone);
    return;
  }

  switch (session.step) {
    case WhatsAppSessionStep.IDLE:
      await handleIdle(msg, input);
      break;
    case WhatsAppSessionStep.CHOOSING_SERVICE:
      await handleChoosingService(msg, input);
      break;
    case WhatsAppSessionStep.CHOOSING_DATE:
      await handleChoosingDate(msg, input);
      break;
    case WhatsAppSessionStep.CHOOSING_TIME:
      await handleChoosingTime(msg, input);
      break;
    case WhatsAppSessionStep.CONFIRMING:
      await handleConfirming(msg);
      break;
    case WhatsAppSessionStep.CANCELLING:
      await handleCancelling(msg, input);
      break;
    case WhatsAppSessionStep.RESCHEDULING:
      await handleRescheduling(msg, input);
      break;
    default:
      await sendMenuHint(msg.phone);
  }
}
