// Dynamically import canvas; if unavailable, fall back to a 1x1 transparent PNG data URL.
let createCanvas = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ createCanvas } = require('canvas'));
} catch (e) {
  console.warn('[calendar-image] canvas module not found – using placeholder image');
}

import { format } from 'date-fns';
import path from 'path';
import fs from 'fs';

/**
 * Generate a calendar image for the given month.
 * If the `canvas` library is unavailable, returns a data‑URL for a 1×1 transparent PNG.
 * @param date Any date within the month to render.
 * @returns Absolute path to the PNG file (or a data‑URL string when canvas missing).
 */
export async function generateCalendarImage(date: Date): Promise<string> {
  // Fallback when canvas cannot be loaded.
  if (!createCanvas) {
    // 1×1 transparent PNG data URL.
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=';
  }

  const monthLabel = format(date, 'MMMM yyyy');
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

  // Grid
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
      if (cellIdx >= startOffset && day <= daysInMonth) {
        // Determine background color
        let bg = '#e0e0e0'; // past default
        if (year === todayYear && month === todayMonth) {
          if (day < todayDay) {
            bg = '#e0e0e0'; // past
          } else if (day === todayDay) {
            bg = '#add8e6'; // today
          } else if (col === 0) {
            bg = '#ffcccc'; // Sunday closed
          } else {
            bg = '#ccffcc'; // available
          }
        } else {
          // Future month – treat Sunday as closed, others available.
          bg = col === 0 ? '#ffcccc' : '#ccffcc';
        }
        ctx.fillStyle = bg;
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.fillStyle = '#000000';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(day), x + cellSize / 2, y + cellSize / 2 + 6);
        day++;
      }
    }
    if (day > daysInMonth) break;
  }

  // Write file to ./tmp
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
