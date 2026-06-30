import { looksLikePersonName } from "./whatsapp-vehicle-parse";

/** Retorna primeiro nome válido ou null (rejeita "oi", "olá", etc.) */
export function resolveValidCustomerName(name?: string | null): string | null {
  if (!name?.trim()) return null;
  const first = name.trim().split(/\s+/)[0];
  if (!looksLikePersonName(first)) return null;
  return first;
}
