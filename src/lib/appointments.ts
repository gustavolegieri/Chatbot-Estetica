import { addMinutes, format, parse, isBefore, isAfter, startOfDay } from "date-fns";
import { prisma } from "./prisma";

export async function getAvailableSlots(dateStr: string, durationMin: number) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) return [];

  const workingDays = settings.workingDays.split(",").map(Number);
  const date = parse(dateStr, "yyyy-MM-dd", new Date());
  const dayOfWeek = date.getDay();

  if (!workingDays.includes(dayOfWeek)) return [];

  const [startH, startM] = settings.businessHoursStart.split(":").map(Number);
  const [endH, endM] = settings.businessHoursEnd.split(":").map(Number);

  const dayStart = new Date(date);
  dayStart.setHours(startH, startM, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endH, endM, 0, 0);

  const existing = await prisma.appointment.findMany({
    where: {
      date: {
        gte: startOfDay(date),
        lt: addMinutes(startOfDay(date), 24 * 60),
      },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });

  const booked = new Set(existing.map((a) => a.startTime));
  const slots: string[] = [];
  let current = dayStart;

  const isToday = format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  while (isBefore(addMinutes(current, durationMin), dayEnd)) {
    const slotStart = format(current, "HH:mm");
    const slotEndTime = addMinutes(current, durationMin);

    if (!booked.has(slotStart)) {
      const isFutureSlot = !isToday || isAfter(current, now);
      if (isFutureSlot && !isAfter(slotEndTime, dayEnd)) {
        slots.push(slotStart);
      }
    }

    current = addMinutes(current, settings.slotDurationMin);
    if (!isBefore(current, dayEnd)) break;
  }

  return slots.filter((s) => !booked.has(s));
}

export function calculateEndTime(startTime: string, durationMin: number): string {
  const base = parse(startTime, "HH:mm", new Date());
  return format(addMinutes(base, durationMin), "HH:mm");
}
