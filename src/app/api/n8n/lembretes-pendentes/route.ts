import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { appointmentDateTime, serializeAgendamento } from "@/lib/n8n-helpers";

const querySchema = z.object({
  janela_horas: z.coerce.number().positive().max(168).default(24),
});

export async function GET(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const parsed = querySchema.safeParse({
      janela_horas: request.nextUrl.searchParams.get("janela_horas") ?? 24,
    });
    if (!parsed.success) {
      return n8nError(parsed.error.errors[0]?.message ?? "Parâmetros inválidos", 400);
    }

    const { janela_horas } = parsed.data;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + janela_horas * 60 * 60 * 1000);

    // Busca confirmados sem lembrete; filtra a janela em memória (date+startTime)
    const candidates = await prisma.appointment.findMany({
      where: {
        status: "CONFIRMED",
        reminderSentAt: null,
        date: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
          lte: new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() + 1),
        },
      },
      include: {
        client: { select: { id: true, name: true, phone: true, vehicleModel: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    const pending = candidates.filter((a) => {
      const when = appointmentDateTime(a.date, a.startTime);
      return when >= now && when <= windowEnd;
    });

    return n8nOk(pending.map(serializeAgendamento));
  } catch (error) {
    console.error("[n8n/lembretes-pendentes GET]", error);
    return n8nError("Erro ao listar lembretes pendentes", 500);
  }
}
