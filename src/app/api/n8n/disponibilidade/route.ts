import { NextRequest } from "next/server";
import { z } from "zod";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { consultarDisponibilidade } from "@/lib/n8n-queries";

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD"),
  servico_id: z.string().optional(),
});

export async function GET(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const parsed = querySchema.safeParse({
      data: request.nextUrl.searchParams.get("data") ?? undefined,
      servico_id: request.nextUrl.searchParams.get("servico_id") ?? undefined,
    });

    if (!parsed.success) {
      return n8nError(parsed.error.errors[0]?.message ?? "Parâmetros inválidos", 400);
    }

    const result = await consultarDisponibilidade(parsed.data.data, parsed.data.servico_id);
    if (!result.ok) return n8nError(result.error, result.status);
    return n8nOk(result.data);
  } catch (error) {
    console.error("[n8n/disponibilidade]", error);
    return n8nError("Erro ao consultar disponibilidade", 500);
  }
}
