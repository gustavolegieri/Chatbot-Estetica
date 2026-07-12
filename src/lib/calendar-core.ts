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
 * Generate a calendar SVG image with the clinic logo, month grid, and occupancy colors.
 * Uses SVG for reliable text rendering (canvas has issues with text in WASM).
 * Converts SVG to PNG using sharp if available, otherwise returns SVG as data URL.
 */
export async function generateCalendarImage(date: Date, customToday?: Date): Promise<string> {
  const data = await getMonthOccupancy(date.getFullYear(), date.getMonth(), customToday);

  // Dimensions conforme especificação
  const cellSize = 70;
  const cellGap = 6;
  const logoHeight = 80;
  const headerMonthHeight = 50;
  const weekdayHeaderHeight = 30;
  const legendHeight = 40;
  const padding = 24;
  
  const cols = 7;
  const rows = Math.ceil(data.days.length / 7);
  
  // Canvas width: padding + cols * (cellSize + gap) - gap + padding
  const gridWidth = cols * cellSize + (cols - 1) * cellGap;
  const svgW = padding * 2 + gridWidth;
  
  // Canvas height: padding + logo + brand text + month + margin + weekday + margin + grid + margin + legend + padding
  const svgH = padding + logoHeight + 30 + headerMonthHeight + 16 + weekdayHeaderHeight + rows * cellSize + (rows - 1) * cellGap + 20 + legendHeight + padding;

  // Build SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`;
  
  // Background - fundo escuro
  svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#0d0d0d"/>`;
  
  let currentY = padding;

  // 1. Logo centralizada (maior) com proporção correta
  const logoWidth = 120;
  const logoX = (svgW - logoWidth) / 2;
  svg += `<image x="${logoX}" y="${currentY}" width="${logoWidth}" height="${logoHeight}" href="/logo-garagem-do-ka.png" preserveAspectRatio="xMidYMid meet"/>`;
  
  currentY += logoHeight + 10;

  // 2. Texto "Garagem do Ka" abaixo da logo
  svg += `<text x="${svgW / 2}" y="${currentY + 20}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16px" font-weight="bold" fill="#c9a24b" text-anchor="middle">Garagem do Ka</text>`;
  
  currentY += 30;

  // 3. Título "Calendário do mês X" em dourado
  svg += `<text x="${svgW / 2}" y="${currentY + 20}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24px" font-weight="bold" fill="#c9a24b" text-anchor="middle">Calendário do ${data.monthLabel}</text>`;
  
  currentY += headerMonthHeight + 16;

  // 4. Cabeçalho dias da semana - dourado claro
  const weekdayShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  
  for (let c = 0; c < cols; c++) {
    const x = padding + c * (cellSize + cellGap) + cellSize / 2;
    svg += `<text x="${x}" y="${currentY + 20}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13px" font-weight="bold" fill="#e5c07b" text-anchor="middle">${weekdayShort[c]}</text>`;
  }
  
  currentY += weekdayHeaderHeight;

  // 5. Grade do calendário
  const monthStart = new Date(data.year, data.month, 1);
  const startOffset = monthStart.getDay();
  let dayCount = 1;
  const daysInMonth = new Date(data.year, data.month + 1, 0).getDate();

  // Cores
  const bgColors = {
    green: "#059669",
    yellow: "#d97706",
    red: "#dc2626",
    closed: "#374151",
    past: "#1f2937",
  };
  
  const textColors = {
    green: "#ffffff",
    yellow: "#ffffff",
    red: "#ffffff",
    closed: "#9ca3af",
    past: "#6b7280",
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padding + c * (cellSize + cellGap);
      const y = currentY + r * (cellSize + cellGap);
      const cellIdx = r * 7 + c;

      if (cellIdx >= startOffset && dayCount <= daysInMonth) {
        const info = data.occupancyMap[dayCount];
        if (!info) { dayCount++; continue; }

        // Determinar cor de fundo e texto
        let bgColor, textColor;
        
        if (info.occupancy === "past") {
          bgColor = bgColors.past;
          textColor = textColors.past;
        } else if (info.occupancy === "closed") {
          bgColor = bgColors.closed;
          textColor = textColors.closed;
        } else {
          const baseOccupancy = info.occupancy === "today" ? "green" : info.occupancy;
          bgColor = bgColors[baseOccupancy as keyof typeof bgColors] || "#ffffff";
          textColor = textColors[baseOccupancy as keyof typeof textColors] || "#ffffff";
        }

        // Desenhar célula com borda arredondada
        const r = 8;
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${r}" ry="${r}" fill="${bgColor}"/>`;

        // Destaque do dia atual - borda dourada
        if (info.occupancy === "today") {
          svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${r}" ry="${r}" fill="none" stroke="#c9a24b" stroke-width="3"/>`;
        }

        // NÚMERO DO DIA - SVG renderiza texto corretamente
        const textX = x + cellSize / 2;
        const textY = y + cellSize / 2 + 6; // +6 para ajuste de baseline
        svg += `<text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19px" font-weight="bold" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${dayCount}</text>`;

        dayCount++;
      }
    }
  }

  currentY += rows * cellSize + (rows - 1) * cellGap + 20;

  // 6. Legenda horizontal com quadradinhos 14x14px
  const legendItems = [
    { color: "#059669", label: "Mais vazio" },
    { color: "#d97706", label: "Médio" },
    { color: "#dc2626", label: "Mais movimentado" },
    { color: "#374151", label: "Fechado" },
  ];
  
  const legendSpacing = svgW / legendItems.length;
  
  legendItems.forEach((item, i) => {
    const lx = padding + i * legendSpacing + legendSpacing / 2 - 35;
    
    // Quadradinho 14x14px
    svg += `<rect x="${lx}" y="${currentY}" width="14" height="14" fill="${item.color}"/>`;
    
    // Texto ao lado - dourado claro
    svg += `<text x="${lx + 20}" y="${currentY + 12}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13px" font-weight="bold" fill="#e5c07b">${item.label}</text>`;
  });

  svg += `</svg>`;

  // Try to convert SVG to PNG using sharp
  try {
    const sharp = await import("sharp");
    const svgBuffer = Buffer.from(svg);
    const pngBuffer = await sharp.default(svgBuffer).png().toBuffer();
    
    // Try to write to public/tmp directory for public access
    try {
      const fs = await import("fs");
      const path = await import("path");
      const publicTmpDir = path.resolve(process.cwd(), "public", "tmp");
      if (!fs.existsSync(publicTmpDir)) {
        fs.mkdirSync(publicTmpDir, { recursive: true });
      }
      const fileName = `calendar-${data.year}-${String(data.month + 1).padStart(2, "0")}.png`;
      const filePath = path.join(publicTmpDir, fileName);
      fs.writeFileSync(filePath, pngBuffer);
      
      // Convert to public URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "";
      const normalizedBase = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
      return `${normalizedBase}/tmp/${fileName}`;
    } catch (err) {
      console.warn("[calendar-core] Could not write to public/tmp directory, using base64 fallback");
      const base64 = pngBuffer.toString("base64");
      return `data:image/png;base64,${base64}`;
    }
  } catch (err) {
    console.warn("[calendar-core] Sharp not available, returning SVG as data URL");
    // Fallback to SVG data URL
    const base64 = Buffer.from(svg).toString("base64");
    return `data:image/svg+xml;base64,${base64}`;
  }
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
