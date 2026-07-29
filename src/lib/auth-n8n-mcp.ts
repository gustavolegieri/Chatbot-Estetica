import { timingSafeEqual } from "crypto";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Valida Bearer token do MCP (n8n) contra N8N_MCP_API_KEY.
 * Fail-safe: se a env var não estiver definida, sempre inválido.
 */
export async function verifyN8nMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const expected = process.env.N8N_MCP_API_KEY;
  if (!expected || !bearerToken) return undefined;

  try {
    const a = Buffer.from(bearerToken);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return undefined;
    if (!timingSafeEqual(a, b)) return undefined;
  } catch {
    return undefined;
  }

  return {
    token: bearerToken,
    clientId: "n8n-mcp",
    scopes: ["read:estetica"],
  };
}
