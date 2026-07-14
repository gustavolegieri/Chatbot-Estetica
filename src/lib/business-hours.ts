import type { Settings } from "@prisma/client";
import { timeToMinutes } from "./appointments";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import { formatHours } from "./whatsapp-flow-messages";

export type ClosedReason = "before_open" | "after_close" | "lunch" | "closed_day";

export interface BusinessHoursStatus {
  isOpen: boolean;
  reason?: ClosedReason;
}

type HoursSettings = Pick<
  Settings,
  | "businessHoursStart"
  | "businessHoursEnd"
  | "lunchBreakStart"
  | "lunchBreakEnd"
  | "workingDays"
>;

export function getBusinessHoursStatus(settings: HoursSettings, now = new Date()): BusinessHoursStatus {
  const workingDays = settings.workingDays.split(",").map(Number);

  // Força timezone para manter consistência independentemente do fuso do servidor.
  // (Requisito: Brasil)
  const tz = "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

  // dayOfWeek: Intl retorna o nome do dia — convertemos para 0..6 do JS (domingo..sábado)
  const weekdayShort = (getPart("weekday") ?? "") as string;
  const map: Record<string, number> = {
    Sun: 0,
    Seg: 1,
    Mon: 1,
    Ter: 2,
    Tue: 2,
    Wed: 3,
    Qua: 3,
    Thu: 4,
    Qui: 4,
    Fri: 5,
    Sex: 5,
    Sat: 6,
    Sab: 6,
  };
  const dayOfWeek = map[weekdayShort] ?? now.getDay();

  if (!workingDays.includes(dayOfWeek)) {
    return { isOpen: false, reason: "closed_day" };
  }

  const hour = Number(getPart("hour") ?? 0);
  const minute = Number(getPart("minute") ?? 0);
  const nowMin = hour * 60 + minute;

  const openMin = timeToMinutes(settings.businessHoursStart);
  const closeMin = timeToMinutes(settings.businessHoursEnd);

  if (nowMin < openMin) {
    return { isOpen: false, reason: "before_open" };
  }
  if (nowMin >= closeMin) {
    return { isOpen: false, reason: "after_close" };
  }

  if (settings.lunchBreakStart && settings.lunchBreakEnd) {
    const lunchStart = timeToMinutes(settings.lunchBreakStart);
    const lunchEnd = timeToMinutes(settings.lunchBreakEnd);
    if (nowMin >= lunchStart && nowMin < lunchEnd) {
      return { isOpen: false, reason: "lunch" };
    }
  }

  return { isOpen: true };
}


export function afterHoursMessage(
  settings: HoursSettings & Pick<Settings, "businessName">,
  clientName?: string | null,
  status?: BusinessHoursStatus
): string {
  const brand = settings.businessName || BRAND_DEFAULT;
  const name = clientName ? `, *${clientName}*` : "";
  const hours = formatHours(
    settings.businessHoursStart,
    settings.businessHoursEnd,
    settings.workingDays
  );

  const reason = status?.reason ?? "after_close";

  let emoji = "🌙";
  let headline = "Estamos fechados no momento";
  let detail = `Nosso expediente hoje encerrou às *${settings.businessHoursEnd}*.`;

  switch (reason) {
    case "before_open":
      emoji = "🌅";
      headline = "Ainda não abrimos";
      detail = `Nosso atendimento começa hoje às *${settings.businessHoursStart}*.`;
      break;
    case "lunch":
      emoji = "🍽️";
      headline = "Intervalo de almoço";
      detail =
        settings.lunchBreakStart && settings.lunchBreakEnd
          ? `Estamos em pausa das *${settings.lunchBreakStart}* às *${settings.lunchBreakEnd}* e voltamos em seguida.`
          : "Estamos em intervalo e voltamos em breve.";
      break;
    case "closed_day":
      emoji = "📅";
      headline = "Hoje não estamos atendendo";
      detail = "Este dia não faz parte da nossa agenda de funcionamento.";
      break;
    case "after_close":
      emoji = "🌙";
      headline = "Já encerramos por hoje";
      detail = `Nosso expediente hoje foi até *${settings.businessHoursEnd}*.`;
      break;
  }

  return [
    `Olá${name}! 👋`,
    ``,
    `${emoji} *${headline}*`,
    ``,
    detail,
    ``,
    `Muito obrigado por entrar em contato com a *${brand}* — sua mensagem é muito importante pra gente 💙`,
    ``,
    `📅 *Nosso horário:*`,
    `${hours}`,
    ``,
    `_Assim que estivermos abertos, nossa equipe retoma o atendimento. Até breve!_ 🚗✨`,
  ].join("\n");
}
