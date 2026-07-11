// Simple calendar image generator – returns a placeholder transparent PNG data URL.
// The real canvas-based generation was removed to avoid the heavy "canvas" dependency
// which is not available in the Vercel build environment.

/** Placeholder transparent PNG (1×1) as a data URL. */
export const PLACEHOLDER_CALENDAR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XjJkAAAAASUVORK5CYII=';

/**
 * Returns a placeholder calendar image.
 * In a future enhancement you could generate a real PNG using a server‑side library.
 * @param _date Ignored – kept for API compatibility.
 * @returns a data URL string representing a transparent PNG.
 */
export async function generateCalendarImage(_date: Date): Promise<string> {
  return PLACEHOLDER_CALENDAR_DATA_URL;
}
