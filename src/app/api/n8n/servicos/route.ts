import { NextRequest } from "next/server";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { listServicosPrecos } from "@/lib/n8n-queries";

export async function GET(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const data = await listServicosPrecos();
    return n8nOk(data);
  } catch (error) {
    console.error("[n8n/servicos]", error);
    return n8nError("Erro ao listar serviços", 500);
  }
}
