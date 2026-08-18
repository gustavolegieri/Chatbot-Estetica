type UnknownRecord = Record<string, unknown>;

export function firstWasenderMessage(data: UnknownRecord): UnknownRecord | null {
  const raw = data.messages ?? data;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === "object" ? (first as UnknownRecord) : null;
  }
  return raw && typeof raw === "object" ? (raw as UnknownRecord) : null;
}

export function isAuthorizedSelfTestPhone(
  phone: string,
  enabled: boolean,
  configuredPhone?: string | null
) {
  if (!enabled) return false;
  const incoming = phone.replace(/\D/g, "");
  const allowed = (configuredPhone ?? "").replace(/\D/g, "");
  return Boolean(allowed && incoming === allowed);
}

export function extractWasenderSendId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const body = result as UnknownRecord;
  const data = body.data && typeof body.data === "object" ? (body.data as UnknownRecord) : null;
  const candidate = data?.msgId ?? data?.id ?? body.msgId ?? body.id;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : null;
}
