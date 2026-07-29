import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Valida API Key do n8n via header `x-api-key`.
 * Fail-safe: se N8N_API_KEY não estiver definida, sempre retorna false.
 */
export function isValidN8nApiKey(request: Request): boolean {
  const expected = process.env.N8N_API_KEY;
  if (!expected) return false;

  const provided = request.headers.get("x-api-key");
  if (!provided) return false;

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function unauthorizedN8nResponse() {
  return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

/** Resposta de erro padrão das rotas /api/n8n */
export function n8nError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Resposta de sucesso padrão das rotas /api/n8n */
export function n8nOk<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}
