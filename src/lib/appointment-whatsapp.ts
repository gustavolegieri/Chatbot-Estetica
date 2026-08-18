import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Appointment, Client, Service } from "@prisma/client";
import { loadPromptMap, renderPrompt } from "./bot-prompts";
import { sendMedia, sendText } from "./evolution-api";
import { prisma } from "./prisma";
import { formatDurationLabel } from "./appointments";

type AptWithRelations = Appointment & { client: Client; service: Service };

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  ) - date.getTime();
}

function businessDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstResult = new Date(
    utcGuess.getTime() - timeZoneOffsetMs(utcGuess, BUSINESS_TIME_ZONE)
  );
  return new Date(
    utcGuess.getTime() - timeZoneOffsetMs(firstResult, BUSINESS_TIME_ZONE)
  );
}

export function appointmentStartsAt(date: Date, startTime: string): Date {
  const [hour = 0, minute = 0] = startTime.split(":").map(Number);
  return businessDateTimeToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    hour,
    minute
  );
}

export function wasMessageSent(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const response = result as { error?: boolean; blocked?: boolean };
  return !response.error && !response.blocked;
}

async function loadSettings() {
  return prisma.settings.findUnique({ where: { id: "default" } });
}

export async function sendAppointmentThankYou(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const brand = settings.businessName ?? "Garagem do Ka";
  const result = await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "appointment_thankyou", {
      name: apt.client.name,
      brand,
      service: apt.service.name,
    }),
  });
  return wasMessageSent(result);
}

export async function sendAppointmentCheckIn(apt: AptWithRelations, snapshotUrl?: string | null) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const text = renderPrompt(prompts, "appointment_checkin", {
    name: apt.client.name,
    service: apt.service.name,
    vehicle: apt.client.vehicleModel ?? "seu veículo",
    plate: apt.client.vehiclePlate ?? "não identificada",
    brand: settings.businessName ?? "Garagem do Ka",
  });
  if (snapshotUrl) {
    const mediaResult = await sendMedia({ number: apt.client.phone, mediaUrl: snapshotUrl, caption: text, mediaType: "image" });
    if (wasMessageSent(mediaResult)) return true;
  }
  return wasMessageSent(await sendText({ number: apt.client.phone, text }));
}

export async function sendAppointmentFinalizing(apt: AptWithRelations, snapshotUrl?: string | null) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone || !apt.client.vehiclePlate) return false;

  const prompts = await loadPromptMap();
  const text = renderPrompt(prompts, "appointment_finalizing", {
    name: apt.client.name,
    service: apt.service.name,
    vehicle: apt.client.vehicleModel ?? "seu veículo",
    plate: apt.client.vehiclePlate,
    brand: settings.businessName ?? "Garagem do Ka",
  });
  if (snapshotUrl) {
    const mediaResult = await sendMedia({ number: apt.client.phone, mediaUrl: snapshotUrl, caption: text, mediaType: "image" });
    if (wasMessageSent(mediaResult)) return true;
  }
  return wasMessageSent(await sendText({ number: apt.client.phone, text }));
}

export async function sendAppointmentTimelapse(apt: AptWithRelations, timelapseUrl?: string | null) {
  if (!timelapseUrl || !apt.client.phone) return false;
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled) return false;
  const result = await sendMedia({
    number: apt.client.phone,
    mediaUrl: timelapseUrl,
    mediaType: "video",
    caption: `🎬 *Um pouco dos cuidados com seu veículo*\n\nPreparamos este registro acelerado do atendimento do *${apt.client.vehicleModel ?? "seu veículo"}*. Pessoas e a área externa foram desfocadas para preservar a privacidade. 🤍`,
  });
  return wasMessageSent(result);
}

export async function sendAppointmentCancelledNotice(apt: AptWithRelations, reason: string) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });
  const result = await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "appointment_cancelled", {
      name: apt.client.name,
      dateLabel,
      time: apt.startTime,
      service: apt.service.name,
      reason,
    }),
  });
  return wasMessageSent(result);
}

export async function sendReminder2h(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
  const brand = settings.businessName ?? "Garagem do Ka";
  const duration = formatDurationLabel(apt.service.durationMin);

  const result = await sendText({
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
  return wasMessageSent(result);
}

/** Compatibilidade com integrações antigas. */
export const sendReminder4h = sendReminder2h;

export async function sendReminderCustom(apt: AptWithRelations, preference: string) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const dateLabel = format(apt.date, "EEEE, dd/MM", { locale: ptBR });
  const brand = settings.businessName ?? "Garagem do Ka";
  const duration = formatDurationLabel(apt.service.durationMin);

  const timeText = preference === "30min" ? "30 minutos" : preference === "1hour" ? "1 hora" : "1 dia";

  const result = await sendText({
    number: apt.client.phone,
    text: `🔔 Lembrete: Seu agendamento na ${brand} é em ${timeText}!\n\n` +
          `👤 ${apt.client.name}\n` +
          `🧽 ${apt.service.name} (${duration})\n` +
          `📅 ${dateLabel} às ${apt.startTime}\n` +
          `📍 ${settings.businessAddress || "Endereço"}\n\n` +
          `Mal podemos esperar pra deixar seu carro brilhando! ✨`,
  });
  return wasMessageSent(result);
}

export async function sendConfirmWarning(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const prompts = await loadPromptMap();
  const result = await sendText({
    number: apt.client.phone,
    text: renderPrompt(prompts, "reminder_30min", {
      name: apt.client.name,
      service: apt.service.name,
      time: apt.startTime,
    }),
  });
  return wasMessageSent(result);
}

export async function sendConfirmationReceived(apt: AptWithRelations) {
  const settings = await loadSettings();
  if (!settings?.whatsappEnabled || !apt.client.phone) return false;

  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });

  const result = await sendText({
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
  return wasMessageSent(result);
}

