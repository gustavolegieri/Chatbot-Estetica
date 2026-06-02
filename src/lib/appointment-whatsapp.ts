import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Appointment, Client, Service } from "@prisma/client";
import { sendText } from "./evolution-api";
import { prisma } from "./prisma";
import { formatDurationLabel } from "./appointments";

type AptWithRelations = Appointment & { client: Client; service: Service };

export function appointmentStartsAt(date: Date, startTime: string): Date {
  const day = format(date, "yyyy-MM-dd");
  return parse(`${day} ${startTime}`, "yyyy-MM-dd HH:mm", new Date());
}

async function loadSettings() {
  return prisma.settings.findUnique({ where: { id: "default" } });
}

export async function sendAppointmentThankYou(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const brand = settings.businessName ?? "Garagem do Ka";
  await sendText({
    number: apt.client.phone,
    text: [
      `Olá, *${apt.client.name}*! ✨`,
      ``,
      `Obrigado por confiar na *${brand}*!`,
      ``,
      `Seu serviço *${apt.service.name}* foi concluído com sucesso 🚗`,
      ``,
      `Foi um prazer cuidar do seu veículo. Esperamos você em breve!`,
    ].join("\n"),
  });
  return true;
}

export async function sendAppointmentCancelledNotice(apt: AptWithRelations, reason: string) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });
  await sendText({
    number: apt.client.phone,
    text: [
      `Olá, *${apt.client.name}*!`,
      ``,
      `Seu agendamento foi *cancelado*:`,
      `📅 ${dateLabel} às ${apt.startTime}`,
      `🔧 ${apt.service.name}`,
      ``,
      reason,
      ``,
      `Para reagendar, envie *menu* aqui no WhatsApp 😊`,
    ].join("\n"),
  });
  return true;
}

export async function sendReminder4h(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
  const brand = settings.businessName ?? "Garagem do Ka";
  const duration = formatDurationLabel(apt.service.durationMin);

  await sendText({
    number: apt.client.phone,
    text: [
      `⏰ *Lembrete — ${brand}*`,
      ``,
      `Olá, *${apt.client.name}*!`,
      ``,
      `Seu agendamento é *hoje*:`,
      `🔧 *${apt.service.name}* (~${duration})`,
      `📅 ${dateLabel} às *${apt.startTime}*`,
      settings.businessAddress ? `📍 ${settings.businessAddress}` : ``,
      ``,
      `Confirme sua presença respondendo *CONFIRME* ou *1*.`,
      ``,
      `_Sem confirmação até 30 min antes, o horário pode ser liberado._`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return true;
}

export async function sendConfirmWarning(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const dateLabel = format(apt.date, "dd/MM", { locale: ptBR });

  await sendText({
    number: apt.client.phone,
    text: [
      `⚠️ *Confirmação necessária*`,
      ``,
      `Olá, *${apt.client.name}*!`,
      ``,
      `Faltam cerca de *30 minutos* para seu horário (${dateLabel} às ${apt.startTime}).`,
      ``,
      `Ainda não recebemos sua confirmação.`,
      ``,
      `Responda *CONFIRME* nos próximos *10 minutos* para manter o agendamento.`,
      ``,
      `_Caso contrário, o horário será cancelado automaticamente._`,
    ].join("\n"),
  });
  return true;
}

export async function sendConfirmationReceived(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });

  await sendText({
    number: apt.client.phone,
    text: [
      `✅ *Presença confirmada!*`,
      ``,
      `Te esperamos *${dateLabel}* às *${apt.startTime}*`,
      `🔧 ${apt.service.name}`,
      settings.businessAddress ? `📍 ${settings.businessAddress}` : ``,
      ``,
      `Qualquer imprevisto, avise por aqui 😊`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return true;
}
