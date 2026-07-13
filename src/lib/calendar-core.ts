import { prisma } from "./prisma";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import { renderLogo } from "./svg-utils";

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
export async function getMonthOccupancy(year: number, month: number, customToday?: Date): Promise<CalendarData> {
  const monthStart = startOfMonth(new Date(year, month));
  const monthEnd = endOfMonth(monthStart);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const config = await loadConfig();
  const today = customToday ? startOfDay(customToday) : startOfDay(new Date());

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

  const monthLabel = format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });

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

async function registerSystemFonts(canvasMod: any): Promise<string> {
  const fs = await import("fs");
  const https = await import("https");
  
  try {
    // Try Windows Arial
    const arialPath = "C:\\Windows\\Fonts\\arial.ttf";
    if (fs.existsSync(arialPath)) {
      canvasMod.registerFont(arialPath, { family: "Arial" });
      return "Arial";
    }
  } catch {}
  
  try {
    // Try macOS Helvetica
    const helveticaPath = "/System/Library/Fonts/Helvetica.ttc";
    if (fs.existsSync(helveticaPath)) {
      canvasMod.registerFont(helveticaPath, { family: "Helvetica" });
      return "Helvetica";
    }
  } catch {}
  
  try {
    // Try Linux DejaVu
    const dejavuPath = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    if (fs.existsSync(dejavuPath)) {
      canvasMod.registerFont(dejavuPath, { family: "DejaVu Sans" });
      return "DejaVu Sans";
    }
  } catch {}
  
  // Fallback: Download font from Google Fonts for Vercel/Linux
  try {
    const fontBuffer = await downloadFont();
    if (fontBuffer) {
      const path = await import("path");
      const os = await import("os");
      const fontPath = path.join(os.tmpdir(), "inter.ttf");
      fs.writeFileSync(fontPath, fontBuffer);
      canvasMod.registerFont(fontPath, { family: "Inter" });
      return "Inter";
    }
  } catch {}
  
  return "sans-serif";
}

async function downloadFont(): Promise<Buffer | null> {
  try {
    // Use fetch instead of https module for better compatibility
    const url = "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2";
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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

export function generateCalendarSVG(data: CalendarData): string {
  const cellSize = 70;
  const cellGap = 6;
  const logoHeight = 80;
  const headerMonthHeight = 50;
  const weekdayHeaderHeight = 30;
  const legendHeight = 40;
  const padding = 24;
  
  const cols = 7;
  const rows = Math.ceil(data.days.length / 7);
  
  const gridWidth = cols * cellSize + (cols - 1) * cellGap;
  const canvasW = padding * 2 + gridWidth;
  const canvasH = padding + logoHeight + 30 + headerMonthHeight + 16 + weekdayHeaderHeight + rows * cellSize + (rows - 1) * cellGap + 20 + legendHeight + padding;

  let svg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="100%" height="100%" fill="#0d0d0d"/>`;
  
  let currentY = padding;
  
  // Logo placeholder
  svg += `<rect x="${(canvasW - 100)/2}" y="${currentY}" width="100" height="${logoHeight}" fill="#c9a24b" rx="8"/>`;
  svg += `<text x="${canvasW/2}" y="${currentY + logoHeight/2 + 10}" text-anchor="middle" fill="#0d0d0d" font-family="Arial, sans-serif" font-weight="bold" font-size="14">LOGO</text>`;
  
  currentY += logoHeight + 10;
  
  // Brand text
  svg += `<text x="${canvasW/2}" y="${currentY + 20}" text-anchor="middle" fill="#c9a24b" font-family="Arial, sans-serif" font-weight="bold" font-size="16">Garagem do Ka</text>`;
  
  currentY += 30;
  
  // Month title
  svg += `<text x="${canvasW/2}" y="${currentY + 20}" text-anchor="middle" fill="#c9a24b" font-family="Arial, sans-serif" font-weight="bold" font-size="24">Calendário do ${data.monthLabel}</text>`;
  
  currentY += headerMonthHeight + 16;
  
  // Weekday headers
  const weekdayShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  svg += `<g font-family="Arial, sans-serif" font-weight="bold" font-size="13" fill="#e5c07b" text-anchor="middle">`;
  for (let c = 0; c < cols; c++) {
    const x = padding + c * (cellSize + cellGap) + cellSize / 2;
    svg += `<text x="${x}" y="${currentY + 20}">${weekdayShort[c]}</text>`;
  }
  svg += `</g>`;
  
  currentY += weekdayHeaderHeight;
  
  // Calendar grid
  let dayCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dayCount >= data.days.length) break;
      
      const dayInfo = data.days[dayCount];
      const x = padding + c * (cellSize + cellGap);
      const y = currentY + r * (cellSize + cellGap);
      
      const color = OCCUPANCY_COLORS[dayInfo.occupancy] || "#374151";
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="6"/>`;
      
      // Today border
      if (dayInfo.occupancy === "today") {
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#c9a24b" stroke-width="3" rx="6"/>`;
      }
      
      const textColor = dayInfo.occupancy === "past" ? "#6b7280" : "#ffffff";
      svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2 + 7}" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-weight="bold" font-size="19">${dayInfo.day}</text>`;
      
      dayCount++;
    }
  }
  
  currentY += rows * cellSize + (rows - 1) * cellGap + 20;
  
  // Legend
  const legendItems = [
    { color: "#059669", label: "Mais vazio" },
    { color: "#d97706", label: "Médio" },
    { color: "#dc2626", label: "Mais movimentado" },
    { color: "#374151", label: "Fechado" },
  ];
  
  const legendSpacing = (canvasW - padding * 2) / legendItems.length;
  
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const lx = padding + i * legendSpacing + legendSpacing / 2 - 40;
    
    svg += `<rect x="${lx}" y="${currentY}" width="14" height="14" fill="${item.color}" rx="2"/>`;
    svg += `<text x="${lx + 20}" y="${currentY + 12}" fill="#e5c07b" font-family="Arial, sans-serif" font-weight="bold" font-size="13">${item.label}</text>`;
  }
  
  svg += `</svg>`;
  return svg;
}

const OCCUPANCY_LABELS: Record<string, string> = {
  green: "Disponível",
  yellow: "Médio",
  red: "Cheio",
  closed: "Fechado",
  past: "",
  today: "Hoje",
};

/**
 * Generate a calendar SVG image with the clinic logo, month grid, and occupancy colors.
 * SVG is used to avoid font dependency issues on Vercel/Linux.
 */
export async function generateCalendarImage(date: Date, customToday?: Date): Promise<string> {
  const data = await getMonthOccupancy(date.getFullYear(), date.getMonth(), customToday);
  
  // Generate SVG directly with renderLogo
  const svg = await generateCalendarSVGInternal(data);
  
  // Return as data URL (SVG is natively supported by browsers and WhatsApp)
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

async function generateCalendarSVGInternal(data: CalendarData): Promise<string> {
  const cellSize = 70;
  const cellGap = 6;
  const logoHeight = 80;
  const headerMonthHeight = 50;
  const weekdayHeaderHeight = 30;
  const legendHeight = 40;
  const padding = 24;
  
  const cols = 7;
  const rows = Math.ceil(data.days.length / 7);
  
  const gridWidth = cols * cellSize + (cols - 1) * cellGap;
  const canvasW = padding * 2 + gridWidth;
  const canvasH = padding + logoHeight + 30 + headerMonthHeight + 16 + weekdayHeaderHeight + rows * cellSize + (rows - 1) * cellGap + 20 + legendHeight + padding;

  let svg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Background
  svg += `<rect width="100%" height="100%" fill="#0d0d0d"/>`;
  
  let currentY = padding;
  
  // Logo using shared function
  const logoSvg = await renderLogo((canvasW - 100) / 2, currentY, 100, logoHeight);
  svg += logoSvg;
  
  currentY += logoHeight + 10;
  
  // Brand text
  svg += `<text x="${canvasW/2}" y="${currentY + 20}" text-anchor="middle" fill="#c9a24b" font-family="Arial, sans-serif" font-weight="bold" font-size="16">Garagem do Ka</text>`;
  
  currentY += 30;
  
  // Month title
  svg += `<text x="${canvasW/2}" y="${currentY + 20}" text-anchor="middle" fill="#c9a24b" font-family="Arial, sans-serif" font-weight="bold" font-size="24">Calendário do ${data.monthLabel}</text>`;
  
  currentY += headerMonthHeight + 16;
  
  // Weekday headers
  const weekdayShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  svg += `<g font-family="Arial, sans-serif" font-weight="bold" font-size="13" fill="#e5c07b" text-anchor="middle">`;
  for (let c = 0; c < cols; c++) {
    const x = padding + c * (cellSize + cellGap) + cellSize / 2;
    svg += `<text x="${x}" y="${currentY + 20}">${weekdayShort[c]}</text>`;
  }
  svg += `</g>`;
  
  currentY += weekdayHeaderHeight;
  
  // Calendar grid - CORRECTED: calculate starting weekday
  const monthStart = new Date(data.year, data.month, 1);
  const startOffset = monthStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  let dayCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellIdx = r * 7 + c;
      const x = padding + c * (cellSize + cellGap);
      const y = currentY + r * (cellSize + cellGap);
      
      // Check if this cell should have a day
      // Days start at startOffset and go through all days in the month
      if (cellIdx >= startOffset && dayCount < data.days.length) {
        const dayInfo = data.days[dayCount];
        
        const color = OCCUPANCY_COLORS[dayInfo.occupancy] || "#374151";
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="6"/>`;
        
        // Today border
        if (dayInfo.occupancy === "today") {
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#c9a24b" stroke-width="3" rx="6"/>`;
        }
        
        const textColor = dayInfo.occupancy === "past" ? "#6b7280" : "#ffffff";
        svg += `<text x="${x + cellSize/2}" y="${y + cellSize/2 + 7}" text-anchor="middle" fill="${textColor}" font-family="Arial, sans-serif" font-weight="bold" font-size="19">${dayInfo.day}</text>`;
        
        dayCount++;
      }
      // Empty cells (before startOffset or after all days) - leave blank
    }
  }
  
  currentY += rows * cellSize + (rows - 1) * cellGap + 20;
  
  // Legend
  const legendItems = [
    { color: "#059669", label: "Mais vazio" },
    { color: "#d97706", label: "Médio" },
    { color: "#dc2626", label: "Mais movimentado" },
    { color: "#374151", label: "Fechado" },
  ];
  
  const legendSpacing = (canvasW - padding * 2) / legendItems.length;
  
  for (let i = 0; i < legendItems.length; i++) {
    const item = legendItems[i];
    const lx = padding + i * legendSpacing + legendSpacing / 2 - 40;
    
    svg += `<rect x="${lx}" y="${currentY}" width="14" height="14" fill="${item.color}" rx="2"/>`;
    svg += `<text x="${lx + 20}" y="${currentY + 12}" fill="#e5c07b" font-family="Arial, sans-serif" font-weight="bold" font-size="13">${item.label}</text>`;
  }
  
  svg += `</svg>`;
  return svg;
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
