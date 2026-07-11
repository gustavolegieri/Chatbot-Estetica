import { createCanvas } from 'canvas';
import { format } from 'date-fns';
import path from 'path';
import fs from 'fs';

/**
 * Gera uma imagem PNG simples que representa o calendário do mês.
 * Para simplicidade, desenha o nome do mês e um grid 7x6 com os dias.
 * Cada dia recebe a cor de acordo com a disponibilidade:
 *   🟢 – disponível (futuro, não domingo)
 *   🔵 – hoje
 *   🔴 – domingo (fechado)
 *   ⚫ – passado (não selecionável)
 *
 * @param date Alguma data dentro do mês que será renderizado (geralmente new Date()).
 * @returns caminho absoluto do arquivo PNG gerado (em ./tmp dentro do projeto).
 */
export async function generateCalendarImage(date: Date): Promise<string> {
  const monthLabel = format(date, 'MMMM yyyy', { locale: undefined });
  const year = date.getFullYear();
  const month = date.getMonth(); // 0‑based
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startOffset = firstDay.getDay(); // 0 = Sunday

  const canvasWidth = 600;
  const canvasHeight = 400;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Title
  ctx.fillStyle = '#000000';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(monthLabel, canvasWidth / 2, 40);

  // Grid settings
  const cellSize = 70;
  const startX = (canvasWidth - cellSize * 7) / 2;
  const startY = 70;

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  let day = 1;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const x = startX + col * cellSize;
      const y = startY + row * cellSize;
      ctx.strokeStyle = '#cccccc';
      ctx.strokeRect(x, y, cellSize, cellSize);

      const cellIdx = row * 7 + col;
      let dayNumber = '';
      if (cellIdx >= startOffset && day <= daysInMonth) {
        dayNumber = day.toString();
        // Determine color
        let bg = '#e0e0e0'; // default past
        if (year === todayYear && month === todayMonth) {
          if (day < todayDay) {
            bg = '#e0e0e0'; // past
          } else if (day === todayDay) {
            bg = '#add8e6'; // today (light blue)
          } else if (col === 0) {
            bg = '#ffcccc'; // sunday closed
          } else {
            bg = '#ccffcc'; // available
          }
        } else {
          // Future month – treat similarly (no past concept)
          if (col === 0) {
            bg = '#ffcccc';
          } else {
            bg = '#ccffcc';
          }
        }
        ctx.fillStyle = bg;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.fillStyle = '#000000';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(dayNumber, x + cellSize / 2, y + cellSize / 2 + 6);
        day++;
      }
    }
  }

  // Ensure tmp dir exists
  const tmpDir = path.resolve(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }
  const fileName = `calendar-${year}-${String(month + 1).padStart(2, '0')}.png`;
  const filePath = path.join(tmpDir, fileName);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  await new Promise<void>((resolve, reject) => {
    stream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', (e) => reject(e));
  });
  return filePath;
}
