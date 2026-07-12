import { prisma } from "./prisma";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isSameDay, startOfDay } from "date-fns";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import satori from "satori";

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
 * Generate a calendar SVG image using satori (React-to-SVG).
 * This properly handles text rendering with system fonts.
 * Returns SVG as data URL (WhatsApp accepts SVG data URLs).
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
  const width = padding * 2 + gridWidth;
  
  // Canvas height: padding + logo + brand text + month + margin + weekday + margin + grid + margin + legend + padding
  const height = padding + logoHeight + 30 + headerMonthHeight + 16 + weekdayHeaderHeight + rows * cellSize + (rows - 1) * cellGap + 20 + legendHeight + padding;

  // Build calendar grid HTML
  const monthStart = new Date(data.year, data.month, 1);
  const startOffset = monthStart.getDay();
  let dayCount = 1;
  const daysInMonth = new Date(data.year, data.month + 1, 0).getDate();

  const weekdayShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  
  // Build cells
  let cellsHtml = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellIdx = r * 7 + c;
      let cellContent = "";
      
      if (cellIdx >= startOffset && dayCount <= daysInMonth) {
        const info = data.occupancyMap[dayCount];
        if (info) {
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
          
          const isToday = info.occupancy === "today";
          const borderStyle = isToday ? "border: 3px solid #c9a24b;" : "";
          
          cellContent = `
            <div style="
              width: ${cellSize}px;
              height: ${cellSize}px;
              background-color: ${bgColor};
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              ${borderStyle}
            ">
              <span style="color: ${textColor}; font-weight: bold; font-size: 19px;">${dayCount}</span>
            </div>
          `;
        }
        dayCount++;
      }
      cellsHtml += cellContent;
    }
  }

  // Build full HTML
  const html = `
    <div style="
      width: ${width}px;
      height: ${height}px;
      background-color: #0d0d0d;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: ${padding}px;
      box-sizing: border-box;
    ">
      <!-- Logo placeholder -->
      <div style="width: 120px; height: ${logoHeight}px; background-color: #1a1a1a; margin-bottom: 10px;"></div>
      
      <!-- Garagem do Ka -->
      <div style="color: #c9a24b; font-weight: bold; font-size: 16px; margin-bottom: 30px;">Garagem do Ka</div>
      
      <!-- Month title -->
      <div style="color: #c9a24b; font-weight: bold; font-size: 24px; margin-bottom: 16px;">Calendário do ${data.monthLabel}</div>
      
      <!-- Weekday headers -->
      <div style="display: flex; gap: ${cellGap}px; margin-bottom: ${weekdayHeaderHeight}px;">
        ${weekdayShort.map(day => `
          <div style="width: ${cellSize}px; text-align: center; color: #e5c07b; font-weight: bold; font-size: 13px;">${day}</div>
        `).join('')}
      </div>
      
      <!-- Calendar grid -->
      <div style="display: grid; grid-template-columns: repeat(7, ${cellSize}px); gap: ${cellGap}px;">
        ${cellsHtml}
      </div>
      
      <!-- Legend -->
      <div style="display: flex; gap: 20px; margin-top: 20px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 14px; height: 14px; background-color: #059669;"></div>
          <span style="color: #e5c07b; font-weight: bold; font-size: 13px;">Mais vazio</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 14px; height: 14px; background-color: #d97706;"></div>
          <span style="color: #e5c07b; font-weight: bold; font-size: 13px;">Médio</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 14px; height: 14px; background-color: #dc2626;"></div>
          <span style="color: #e5c07b; font-weight: bold; font-size: 13px;">Mais movimentado</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div style="width: 14px; height: 14px; background-color: #374151;"></div>
          <span style="color: #e5c07b; font-weight: bold; font-size: 13px;">Fechado</span>
        </div>
      </div>
    </div>
  `;

  // Convert HTML to SVG using satori
  try {
    // Use system fonts
    const fontData = await fetch("https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2").then(res => res.arrayBuffer());
    
    const svg = await satori(html, {
      width,
      height,
      fonts: [
        {
          name: "Inter",
          data: fontData,
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: fontData,
          weight: 700,
          style: "normal",
        },
      ],
    });
    
    // Try to convert SVG to PNG using sharp for better compatibility
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
  } catch (err) {
    console.error("[calendar-core] Satori error:", err);
    // Fallback to placeholder
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=";
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
