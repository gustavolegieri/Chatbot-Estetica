import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Appointment, Client, Service } from "@prisma/client";
import { loadPromptMap, renderPrompt } from "./bot-prompts";
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

  const prompts = await loadPromptMap();
  const brand = settings.businessName ?? "Garagem do Ka";
  await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "appointment_thankyou", {
      name: apt.client.name,
      brand,
      service: apt.service.name,
    }),
  });
  return true;
}

export async function sendAppointmentCancelledNotice(apt: AptWithRelations, reason: string) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });
  await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "appointment_cancelled", {
      name: apt.client.name,
      dateLabel,
      time: apt.startTime,
      service: apt.service.name,
      reason,
    }),
  });
  return true;
}

export async function sendReminder4h(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
  const brand = settings.businessName ?? "Garagem do Ka";
  const duration = formatDurationLabel(apt.service.durationMin);

  await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "reminder_4h", {
      brand,
      name: apt.client.name,
      service: apt.service.name,
      duration,
      dateLabel,
      time: apt.startTime,
      addressLine: settings.businessAddress ? `📍 ${settings.businessAddress}` : "",
    }),
  });
  return true;
}

export async function sendReminderCustom(apt: AptWithRelations, preference: string) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
  const brand = settings.businessName ?? "Garagem do Ka";
  const duration = formatDurationLabel(apt.service.durationMin);

  const timeText = preference === "30min" ? "30 minutos" : preference === "1hour" ? "1 hora" : "1 dia";

  await sendText({
    number: apt.client.phone,
    text: `🔔 Lembrete: Seu agendamento na ${brand} é em ${timeText}!\n\n` +
          `👤 ${apt.client.name}\n` +
          `🧽 ${apt.service.name} (${duration})\n` +
          `📅 ${dateLabel} às ${apt.startTime}\n` +
          `📍 ${settings.businessAddress || "Endereço"}\n\n` +
          `Mal podemos esperar pra deixar seu carro brilhando! ✨`,
  });
  return true;
}

export async function sendConfirmWarning(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "reminder_30min", {
      name: apt.client.name,
      service: apt.service.name,
      time: apt.startTime,
    }),
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

