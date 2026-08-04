const MAX_WEBHOOK_AGE_MS = 24 * 60 * 60 * 1000;

/** Accept Unix seconds or milliseconds without discarding clock-skewed events. */
export function isWasenderMessageTooOld(
  messageTimestamp?: number | string,
  nowMs = Date.now()
): boolean {
  if (!messageTimestamp) return false;
  const numeric = Number(messageTimestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;

  const epochMs = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return nowMs - epochMs > MAX_WEBHOOK_AGE_MS;
}
