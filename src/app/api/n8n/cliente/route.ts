import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import {
  findClientByPhone,
  serializeCliente,
  upsertConversationState,
} from "@/lib/n8n-helpers";
import { consultarCliente } from "@/lib/n8n-queries";

const patchSchema = z.object({
  telefone: z.string().min(10, "telefone inválido"),
  nome: z.string().min(1).optional(),
  estado_conversa: z.string().optional(),
  dados_conversa: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const telefone = request.nextUrl.searchParams.get("telefone");
    if (!telefone) return n8nError("Parâmetro telefone é obrigatório", 400);

    const result = await consultarCliente(telefone);
    if (result.data.cliente_novo) {
      return n8nError("Cliente não encontrado", 404);
    }

    const { cliente_novo: _novo, ...cliente } = result.data;
    return n8nOk(cliente);
  } catch (error) {
    console.error("[n8n/cliente GET]", error);
    return n8nError("Erro ao buscar cliente", 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return n8nError(parsed.error.errors[0]?.message ?? "Dados inválidos", 400);
    }

    const { telefone, nome, estado_conversa, dados_conversa } = parsed.data;
    const phone = normalizePhone(telefone);

    let client = await findClientByPhone(phone);

    if (!client) {
      client = await prisma.client.create({
        data: {
          phone,
          name: nome?.trim() || "Cliente",
        },
        include: {
          whatsappSessions: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: { step: true, lastStage: true, metadata: true },
          },
        },
      });
    } else if (nome !== undefined) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { name: nome.trim() },
        include: {
          whatsappSessions: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: { step: true, lastStage: true, metadata: true },
          },
        },
      });
    }

    if (estado_conversa !== undefined || dados_conversa !== undefined) {
      await upsertConversationState(client.phone, {
        clientId: client.id,
        estado_conversa,
        dados_conversa: dados_conversa as Record<string, unknown> | undefined,
      });

      // Recarrega com sessão atualizada
      const refreshed = await findClientByPhone(client.phone);
      if (refreshed) client = refreshed;
    }

    return n8nOk(serializeCliente(client));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return n8nError("Telefone já cadastrado", 409);
    }
    console.error("[n8n/cliente PATCH]", error);
    return n8nError("Erro ao salvar cliente", 500);
  }
}
