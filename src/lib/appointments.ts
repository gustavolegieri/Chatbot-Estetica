import { addMinutes, format, parse, isBefore, isAfter, startOfDay } from "date-fns";
import { prisma } from "./prisma";

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Verifica se o intervalo [start, start+duration) sobrepõe algum agendamento existente */
export function overlapsExisting(
  startMin: number,
  durationMin: number,
  bookings: { startTime: string; endTime: string }[]
): boolean {
  const endMin = startMin + durationMin;
  for (const b of bookings) {
    const bStart = timeToMinutes(b.startTime);
    const bEnd = timeToMinutes(b.endTime);
    if (startMin < bEnd && bStart < endMin) return true;
  }
  return false;
}

function isInLunchBreak(cursor: number, durationMin: number, lunchStart?: string | null, lunchEnd?: string | null): boolean {
  if (!lunchStart || !lunchEnd) return false;
  const lunchStartMin = timeToMinutes(lunchStart);
  const lunchEndMin = timeToMinutes(lunchEnd);
  const slotEnd = cursor + durationMin;
  return cursor < lunchEndMin && slotEnd > lunchStartMin;
}

function isInBlockedWindow(cursor: number, durationMin: number, blockStart?: string | null, blockEnd?: string | null): boolean {
  if (!blockStart || !blockEnd) return false;
  const bStart = timeToMinutes(blockStart);
  const bEnd = timeToMinutes(blockEnd);
  const slotEnd = cursor + durationMin;
  return cursor < bEnd && bStart < slotEnd;
}

export async function getAvailableSlots(
  dateStr: string,
  durationMin: number,
  excludeAppointmentId?: string
) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) return [];

  const workingDays = settings.workingDays.split(",").map(Number);
  const date = parse(dateStr, "yyyy-MM-dd", new Date());
  const dayOfWeek = date.getDay();

  if (!workingDays.includes(dayOfWeek)) return [];

  const blocked = await prisma.blockedDate.findUnique({
    where: { date: startOfDay(date) },
  });

  if (blocked && !blocked.blockStart && !blocked.blockEnd) return [];

  const [startH, startM] = settings.businessHoursStart.split(":").map(Number);
  const [endH, endM] = settings.businessHoursEnd.split(":").map(Number);

  const dayStartMin = startH * 60 + startM;
  const dayEndMin = endH * 60 + endM;

  const existing = await prisma.appointment.findMany({
    where: {
      date: {
        gte: startOfDay(date),
        lt: addMinutes(startOfDay(date), 24 * 60),
      },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });

  const slots: string[] = [];
  const step = settings.slotDurationMin;
  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  for (let cursor = dayStartMin; cursor + durationMin <= dayEndMin; cursor += step) {
    if (isToday && cursor < nowMin) continue;
    if (isInLunchBreak(cursor, durationMin, settings.lunchBreakStart, settings.lunchBreakEnd)) continue;
    if (isInBlockedWindow(cursor, durationMin, blocked?.blockStart, blocked?.blockEnd)) continue;
    if (!overlapsExisting(cursor, durationMin, existing)) {
      slots.push(minutesToTime(cursor));
    }
  }

  return slots;
}

export function calculateEndTime(startTime: string, durationMin: number): string {
  const base = parse(startTime, "HH:mm", new Date());
  return format(addMinutes(base, durationMin), "HH:mm");
}

/** Normaliza entrada do cliente para HH:mm ou null */
export function parseTimeInput(text: string): string | null {
  const t = text.trim().toLowerCase();
  const match =
    t.match(/^(\d{1,2})[:h](\d{2})$/) ||
    t.match(/^(\d{1,2})[:h](\d{1})$/) ||
    t.match(/^(\d{1,2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2].padEnd(2, "0"), 10) : 0;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function isSlotAvailable(
  dateStr: string,
  startTime: string,
  durationMin: number,
  excludeAppointmentId?: string
): Promise<boolean> {
  const slots = await getAvailableSlots(dateStr, durationMin, excludeAppointmentId);
  return slots.includes(startTime);
}

export function formatDurationLabel(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (h > 0) return `${h}h`;
  return `${m} min`;
}
