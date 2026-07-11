import { prisma } from "./prisma";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isSameDay, startOfDay } from "date-fns";
import { BRAND_DEFAULT } from "./whatsapp-catalog";

// ─── Tipos ───────────────────────────────────────────────────────

export interface DayInfo {
  date: Date;
  day: number;
  iso: string;
  weekday: number; // 0 = Sun
  occupancy: "green" | "yellow" | "red" | "closed" | "past" | "today";
  slotsTotal: number;
  slotsBooked: number;
}

export interface OccupancyMap {
  [day: number]: DayInfo;
}

export interface CalendarData {
  year: number;
  month: number;
  monthLabel: string;
  days: DayInfo[];
  occupancyMap: OccupancyMap;
}

export interface ListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

// ─── Business Hours / Config ─────────────────────────────────────

interface BusinessConfig {
  businessHoursStart: string;
  businessHoursEnd: string;
  slotDurationMin: number;
  workingDays: number[]; // 0–6
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
}

async function loadConfig(): Promise<BusinessConfig> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  return {
    businessHoursStart: settings?.businessHoursStart ?? "08:00",
    businessHoursEnd: settings?.businessHoursEnd ?? "18:00",
    slotDurationMin: settings?.slotDurationMin ?? 60,
    workingDays: (settings?.workingDays ?? "1,2,3,4,5,6").split(",").map(Number),
    lunchBreakStart: settings?.lunchBreakStart ?? null,
    lunchBreakEnd: settings?.lunchBreakEnd ?? null,
  };
}

/** Count total possible slots for a day based on business hours & slot duration. */
function countTotalSlots(date: Date, config: BusinessConfig): number {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return 0; // Sunday closed
  if (!config.workingDays.includes(dayOfWeek)) return 0;

  const [startH, startM] = config.businessHoursStart.split(":").map(Number);
  const [endH, endM] = config.businessHoursEnd.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  let total = Math.floor((endMin - startMin) / config.slotDurationMin);

  // Subtract lunch break slots if applicable
  if (config.lunchBreakStart && config.lunchBreakEnd) {
    const [lunchH, lunchM] = config.lunchBreakStart.split(":").map(Number);
    const [lunchEndH, lunchEndM] = config.lunchBreakEnd.split(":").map(Number);
    const lunchStartMin = lunchH * 60 + lunchM;
    const lunchEndMin = lunchEndH * 60 + lunchEndM;
    const lunchSlots = Math.ceil((lunchEndMin - lunchStartMin) / config.slotDurationMin);
    total -= lunchSlots;
  }

  return Math.max(total, 0);
}

// ─── Occupancy calculation ─────────────────────────────────────

/**
 * Fetch appointment data for a month and compute per‑day occupancy.
 * Occupancy levels:
 *   green  → <=30% of slots booked
 *   yellow → <=70% of slots booked
 *   red    → >70% of slots booked
 */
export async function getMonthOccupancy(year: number, month: number): Promise<CalendarData> {
  const monthStart = startOfMonth(new Date(year, month));
  const monthEnd = endOfMonth(monthStart);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const config = await loadConfig();
  const today = startOfDay(new Date());

  // Get existing appointments for this month
  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: monthStart, lt: new Date(year, month + 1, 1) },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { date: true },
  });

  // Count appointments per day number
  const apptByDay = new Map<number, number>();
  for (const a of appointments) {
    const d = a.date.getDate();
    apptByDay.set(d, (apptByDay.get(d) ?? 0) + 1);
  }

  const days: DayInfo[] = [];
  const occupancyMap: OccupancyMap = {};

  for (const date of allDays) {
    const day = date.getDate();
    const weekday = date.getDay();
    const iso = format(date, "yyyy-MM-dd");
    const isSunday = weekday === 0;
    const isPast = isBefore(date, today) && !isSameDay(date, today);
    const isToday = isSameDay(date, today);

    let occupancy: DayInfo["occupancy"] = "green";
    let slotsTotal = 0;
    let slotsBooked = 0;

    if (isSunday) {
      occupancy = "closed";
    } else if (isPast) {
      occupancy = "past";
    } else if (isToday) {
      // For today, compute real occupancy
      if (!isSunday) {
        slotsTotal = countTotalSlots(date, config);
        slotsBooked = apptByDay.get(day) ?? 0;
        const pct = slotsTotal > 0 ? slotsBooked / slotsTotal : 0;
        if (pct > 0.7) occupancy = "red";
        else if (pct > 0.3) occupancy = "yellow";
        else occupancy = "today";
      }
    } else {
      // Future day
      slotsTotal = countTotalSlots(date, config);
      slotsBooked = apptByDay.get(day) ?? 0;
      const pct = slotsTotal > 0 ? slotsBooked / slotsTotal : 0;
      if (pct > 0.7) occupancy = "red";
      else if (pct > 0.3) occupancy = "yellow";
      else occupancy = "green";
    }

    const info: DayInfo = {
      date,
      day,
      iso,
      weekday,
      occupancy,
      slotsTotal,
      slotsBooked,
    };
    days.push(info);
    occupancyMap[day] = info;
  }

  const monthLabel = format(monthStart, "MMMM' de 'yyyy");

  return { year, month, monthLabel, days, occupancyMap };
}

// ─── Image generation with @napi-rs/canvas ──────────────────────

async function loadCanvas() {
  try {
    return await import("@napi-rs/canvas");
  } catch {
    return null;
  }
}

const OCCUPANCY_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  closed: "#6b7280",
  past: "#d1d5db",
  todayBorder: "#3b82f6",
};

const OCCUPANCY_LABELS: Record<string, string> = {
  green: "Disponível",
  yellow: "Médio",
  red: "Cheio",
  closed: "Fechado",
  past: "",
  today: "Hoje",
};

/**
 * Generate a calendar PNG image with the clinic logo, month grid, and occupancy colors.
 * Uses @napi-rs/canvas (WASM, works on Vercel).
 * Falls back to placeholder data URL if canvas is unavailable.
 */
export async function generateCalendarImage(date: Date): Promise<string> {
  const canvasMod = await loadCanvas();
  if (!canvasMod) {
    console.warn("[calendar-core] @napi-rs/canvas not available – using placeholder");
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=";
  }

  const { createCanvas, loadImage } = canvasMod;
  const data = await getMonthOccupancy(date.getFullYear(), date.getMonth());

  // Dimensions
  const cellSize = 72;
  const headerHeight = 30;
  const logoHeight = 50;
  const padding = 20;
  const cols = 7;
  const rows = Math.ceil(data.days.length / 7);
  const canvasW = cols * cellSize + padding * 2;
  const canvasH = logoHeight + headerHeight + rows * cellSize + padding * 2 + 40;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Try to load logo
  try {
    const logo = await loadImage("public/logo-garagem-do-ka.png");
    ctx.drawImage(logo, padding, 8, 100, logoHeight);
  } catch {
    // Fallback: text instead of logo
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(BRAND_DEFAULT, padding, 30);
  }

  // Month title
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(data.monthLabel, canvasW - padding, 35);

  // Weekday headers
  const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  ctx.textAlign = "center";
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#64748b";
  const topY = padding + logoHeight + 10;
  for (let c = 0; c < cols; c++) {
    const x = padding + c * cellSize + cellSize / 2;
    ctx.fillText(weekdayShort[c], x, topY + 15);
  }

  // Calendar grid
  const gridY = topY + 25;
  const monthStart = new Date(data.year, data.month, 1);
  const startOffset = monthStart.getDay();
  let dayCount = 1;
  const daysInMonth = new Date(data.year, data.month + 1, 0).getDate();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padding + c * cellSize;
      const y = gridY + r * cellSize;
      const cellIdx = r * 7 + c;

      // Draw cell border
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize, cellSize);

      if (cellIdx >= startOffset && dayCount <= daysInMonth) {
        const info = data.occupancyMap[dayCount];
        if (!info) { dayCount++; continue; }

        // Cell background
        if (info.occupancy !== "past" && info.occupancy !== "closed") {
          const bgColor = OCCUPANCY_COLORS[info.occupancy === "today" ? "green" : info.occupancy];
          ctx.fillStyle = bgColor + "30"; // 30 = ~19% opacity
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        } else if (info.occupancy === "closed") {
          ctx.fillStyle = "#f1f5f9";
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }

        // Today highlight (border)
        if (info.occupancy === "today") {
          ctx.strokeStyle = OCCUPANCY_COLORS.todayBorder;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        }

        // Day number
        ctx.fillStyle = info.occupancy === "closed" ? "#94a3b8" : "#1e293b";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(dayCount), x + cellSize / 2, y + cellSize / 2);

        // Small indicator dot for availability
        if (info.occupancy !== "past" && info.occupancy !== "closed" && info.occupancy !== "today") {
          const dotColor = OCCUPANCY_COLORS[info.occupancy];
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize - 10, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        dayCount++;
      }
    }
  }

  // Legend
  const legendY = gridY + rows * cellSize + 10;
  ctx.textAlign = "center";
  ctx.font = "12px sans-serif";
  const legendItems = [
    { color: "#22c55e", label: "Disponível" },
    { color: "#eab308", label: "Médio" },
    { color: "#ef4444", label: "Cheio" },
    { color: "#3b82f6", label: "Hoje" },
    { color: "#6b7280", label: "Fechado" },
  ];
  const legendSpacing = canvasW / legendItems.length;
  legendItems.forEach((item, i) => {
    const lx = legendSpacing * i + legendSpacing / 2;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(lx - 25, legendY + 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#475569";
    ctx.textAlign = "left";
    ctx.fillText(item.label, lx - 15, legendY + 9);
  });

  // Return as buffer
  const buffer = canvas.toBuffer("image/png");
  // Write to tmp file
  const fs = await import("fs");
  const path = await import("path");
  const tmpDir = path.resolve(process.cwd(), "tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
  const fileName = `calendar-${data.year}-${String(data.month + 1).padStart(2, "0")}.png`;
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

// ─── Build WhatsApp List Message Sections ────────────────────────

const MAX_LIST_ROWS = 10;

/**
 * Build WhatsApp Interactive List sections based on real occupancy data.
 * Sections: "Mais disponíveis 🟢", "Médio 🟡", "Mais cheios 🔴"
 * Each section has at most 10 rows (WhatsApp limit per list is 10 total across sections).
 */
export function buildDayListSections(occupancyMap: OccupancyMap, month: number, year: number): ListSection[] {
  const green: Array<{ id: string; title: string; description?: string }> = [];
  const yellow: Array<{ id: string; title: string; description?: string }> = [];
  const red: Array<{ id: string; title: string; description?: string }> = [];
  const today = startOfDay(new Date());

  for (const dayStr in occupancyMap) {
    const info = occupancyMap[dayStr];
    if (info.occupancy === "past" || info.occupancy === "closed") continue;
    if (isBefore(info.date, today) && !isSameDay(info.date, today)) continue;

    const dayLabel = String(info.day).padStart(2, "0");
    const emoji = info.occupancy === "red" ? "🔴" : info.occupancy === "yellow" ? "🟡" : "🟢";
    const row = {
      id: info.iso,
      title: `${dayLabel} ${emoji}`,
      description: info.occupancy === "today" ? "Hoje" : OCCUPANCY_LABELS[info.occupancy],
    };

    // Collect up to 10 per section
    if (info.occupancy === "red" && red.length < MAX_LIST_ROWS) red.push(row);
    else if (info.occupancy === "yellow" && yellow.length < MAX_LIST_ROWS) yellow.push(row);
    else if (green.length < MAX_LIST_ROWS) green.push(row);
  }

  const sections: ListSection[] = [];
  if (green.length) sections.push({ title: "Mais disponíveis 🟢", rows: green });
  if (yellow.length) sections.push({ title: "Ocupação média 🟡", rows: yellow });
  if (red.length) sections.push({ title: "Mais cheios 🔴", rows: red });

  return sections;
}
