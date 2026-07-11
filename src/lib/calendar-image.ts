// Calendar image generator with graceful fallback when the 'canvas' library is unavailable.
// The function returns either an absolute path to a generated PNG file or a data‑URL
// for a 1×1 transparent PNG when canvas cannot be loaded.

import { format } from 'date-fns';
import path from 'path';
import fs from 'fs';

/** Placeholder image (1×1 transparent PNG) as a data URL. */
const PLACEHOLDER_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=';

/**
 * Generate a calendar image for the month of the provided date.
 * If the `canvas` package cannot be imported, the function returns the placeholder
 * data‑URL instead of writing a file.
 *
 * @param date Any date inside the target month.
 * @returns Absolute path to a PNG file in ./tmp, or the placeholder data‑URL.
 */
export async function generateCalendarImage(date: Date): Promise<string> {
  // Try to load canvas lazily – this prevents the bundler from statically
  // resolving the module, which would otherwise cause a build error on Vercel.
  let createCanvas: any = null;
  try {
    // Dynamic `import()` returns a Promise and is ignored by static analysis.
    const canvasMod = await import('canvas');
    createCanvas = canvasMod.createCanvas;
  } catch (e) {
    console.warn('[calendar-image] canvas module not found – using placeholder image');
    return PLACEHOLDER_DATA_URL;
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
      if (cellIdx >= startOffset && day <= daysInMonth) {
        // Choose background colour based on availability rules.
        let bg = '#e0e0e0'; // past by default
        if (year === todayYear && month === todayMonth) {
          if (day < todayDay) {
            bg = '#e0e0e0'; // past
          } else if (day === todayDay) {
            bg = '#add8e6'; // today (light blue)
          } else if (col === 0) {
            bg = '#ffcccc'; // Sunday closed
          } else {
            bg = '#ccffcc'; // available
          }
        } else {
          // Future month – treat Sunday as closed, others as available.
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

  // Write image to ./tmp directory.
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
