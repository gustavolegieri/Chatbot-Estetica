import { prisma } from "./prisma";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
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

async function registerSystemFonts(canvasMod: any) {
  const fs = await import("fs");
  try {
    // Try Windows Arial
    const arialPath = "C:\\Windows\\Fonts\\arial.ttf";
    if (fs.existsSync(arialPath)) {
      canvasMod.registerFont(arialPath, { family: "Arial" });
      return;
    }
  } catch {}
  
  try {
    // Try macOS Helvetica
    const helveticaPath = "/System/Library/Fonts/Helvetica.ttc";
    if (fs.existsSync(helveticaPath)) {
      canvasMod.registerFont(helveticaPath, { family: "Helvetica" });
      return;
    }
  } catch {}
  
  try {
    // Try Linux DejaVu
    const dejavuPath = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    if (fs.existsSync(dejavuPath)) {
      canvasMod.registerFont(dejavuPath, { family: "DejaVu Sans" });
      return;
    }
  } catch {}
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
 * Uses @napi-rs/canvas with registered system fonts for text rendering.
 */
export async function generateCalendarImage(date: Date, customToday?: Date): Promise<string> {
  const canvasMod = await loadCanvas();
  if (!canvasMod) {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=";
  }

  // Register system fonts
  await registerSystemFonts(canvasMod);

  const { createCanvas, loadImage } = canvasMod;
  
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
  const canvasW = padding * 2 + gridWidth;
  
  // Canvas height: padding + logo + brand text + month + margin + weekday + margin + grid + margin + legend + padding
  const canvasH = padding + logoHeight + 30 + headerMonthHeight + 16 + weekdayHeaderHeight + rows * cellSize + (rows - 1) * cellGap + 20 + legendHeight + padding;

  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");

  // Background - fundo escuro conforme especificação
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, canvasW, canvasH);

  let currentY = padding;

  // 1. Logo centralizada com proporção correta
  try {
    const logo = await loadImage("public/logo-garagem-do-ka.png");
    // Manter proporção original (aspect ratio)
    const logoAspectRatio = logo.width / logo.height;
    const logoWidth = logoHeight * logoAspectRatio;
    const logoX = (canvasW - logoWidth) / 2;
    ctx.drawImage(logo, logoX, currentY, logoWidth, logoHeight);
  } catch {
    // Fallback: text instead of logo
    ctx.fillStyle = "#c9a24b"; // Dourado
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(BRAND_DEFAULT, canvasW / 2, currentY + 35);
  }
  
  currentY += logoHeight + 10;

  // 2. Texto "Garagem do Ka" abaixo da logo
  ctx.fillStyle = "#c9a24b"; // Dourado
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Garagem do Ka", canvasW / 2, currentY + 20);
  
  currentY += 30;

  // 3. Título "Calendário do mês X" em dourado
  ctx.fillStyle = "#c9a24b"; // Dourado
  ctx.font = "bold 24px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Calendário do ${data.monthLabel}`, canvasW / 2, currentY + 20);
  
  currentY += headerMonthHeight + 16; // Espaço 16px

  // 4. Cabeçalho dias da semana - dourado claro
  const weekdayShort = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  ctx.textAlign = "center";
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillStyle = "#e5c07b"; // Dourado claro
  
  for (let c = 0; c < cols; c++) {
    const x = padding + c * (cellSize + cellGap) + cellSize / 2;
    ctx.fillText(weekdayShort[c], x, currentY + 20);
  }
  
  currentY += weekdayHeaderHeight;

  // 5. Grade do calendário
  const monthStart = new Date(data.year, data.month, 1);
  const startOffset = monthStart.getDay();
  let dayCount = 1;
  const daysInMonth = new Date(data.year, data.month + 1, 0).getDate();

  // Cores pastel com mais saturação para contraste em fundo escuro
  const bgColors = {
    green: "#059669",      // verde mais saturado
    yellow: "#d97706",    // amarelo mais saturado
    red: "#dc2626",       // vermelho mais saturado
    closed: "#374151",    // cinza escuro
    past: "#1f2937",      // cinza muito escuro
    today: "#059669",     // usa a cor da disponibilidade
  };
  
  const textColors = {
    green: "#ffffff",     // branco para contraste
    yellow: "#ffffff",   // branco para contraste
    red: "#ffffff",      // branco para contraste
    closed: "#9ca3af",   // cinza claro
    past: "#6b7280",      // cinza médio
    today: "#ffffff",    // branco para contraste
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padding + c * (cellSize + cellGap);
      const y = currentY + r * (cellSize + cellGap);
      const cellIdx = r * 7 + c;

      // Fundo da célula e número
      if (cellIdx >= startOffset && dayCount <= daysInMonth) {
        const info = data.occupancyMap[dayCount];
        if (!info) { 
          dayCount++; 
          continue; 
        }

        // Determinar cor de fundo e texto
        let bgColor, textColor;
        
        if (info.occupancy === "past") {
          bgColor = bgColors.past;
          textColor = textColors.past;
        } else if (info.occupancy === "closed") {
          bgColor = bgColors.closed;
          textColor = textColors.closed;
        } else {
          // Para today, usa a cor baseada na ocupação real
          const baseOccupancy = info.occupancy === "today" ? "green" : info.occupancy;
          bgColor = bgColors[baseOccupancy as keyof typeof bgColors] || "#ffffff";
          textColor = textColors[baseOccupancy as keyof typeof textColors] || "#1a1a1a";
        }

        // Desenhar célula com borda arredondada
        ctx.fillStyle = bgColor;
        
        // Desenhar retângulo arredondado manualmente
        const r = 8;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + cellSize - r, y);
        ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + r);
        ctx.lineTo(x + cellSize, y + cellSize - r);
        ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - r, y + cellSize);
        ctx.lineTo(x + r, y + cellSize);
        ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        // Destaque do dia atual - borda dourada
        if (info.occupancy === "today") {
          ctx.strokeStyle = "#c9a24b"; // Dourado
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + cellSize - r, y);
          ctx.quadraticCurveTo(x + cellSize, y, x + cellSize, y + r);
          ctx.lineTo(x + cellSize, y + cellSize - r);
          ctx.quadraticCurveTo(x + cellSize, y + cellSize, x + cellSize - r, y + cellSize);
          ctx.lineTo(x + r, y + cellSize);
          ctx.quadraticCurveTo(x, y + cellSize, x, y + cellSize - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
          ctx.stroke();
        }

        // NÚMERO DO DIA - sempre visível, centralizado, fonte 18-20px, negrito, cor escura
        const textX = x + cellSize / 2;
        const textY = y + cellSize / 2;
        const text = String(dayCount);
        
        // Usar Arial (registrada) ou fallback
        ctx.fillStyle = textColor;
        ctx.font = "bold 19px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Desenhar texto
        ctx.fillText(text, textX, textY);

        dayCount++;
      }
      // Células vazias (fora do mês): completamente em branco
    }
  }

  currentY += rows * cellSize + (rows - 1) * cellGap + 20; // Espaço 20px

  // 6. Legenda horizontal com quadradinhos 14x14px - tema escuro/dourado
  const legendItems = [
    { color: "#059669", label: "Mais vazio" },
    { color: "#d97706", label: "Médio" },
    { color: "#dc2626", label: "Mais movimentado" },
    { color: "#374151", label: "Fechado" },
  ];
  
  // Aumentar espaçamento para deixar os itens mais próximos
  const legendSpacing = (canvasW - padding * 2) / legendItems.length;
  
  legendItems.forEach((item, i) => {
    const lx = padding + i * legendSpacing + legendSpacing / 2 - 40; // Ajuste para centralizar
    
    // Quadradinho 14x14px
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, currentY, 14, 14);
    
    // Texto ao lado - branco/dourado claro
    ctx.fillStyle = "#e5c07b"; // Dourado claro
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(item.label, lx + 20, currentY + 12);
  });

  // Return as buffer
  const buffer = canvas.toBuffer("image/png");
  
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
    fs.writeFileSync(filePath, buffer);
    
    // In development, use localhost URL; in production, use environment variable
    const isDev = process.env.NODE_ENV === "development";
    const baseUrl = isDev 
      ? "http://localhost:3000" 
      : (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "");
    const normalizedBase = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
    const finalUrl = `${normalizedBase}/tmp/${fileName}`;
    return finalUrl;
  } catch (err) {
    // Fallback to base64 data URL
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
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
