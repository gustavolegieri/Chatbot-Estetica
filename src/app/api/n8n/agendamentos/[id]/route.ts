import { NextRequest } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { calculateEndTime, isSlotAvailable } from "@/lib/appointments";
import { parseIsoDateLocal } from "@/lib/date-br";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { parseN8nStatus, serializeAgendamento } from "@/lib/n8n-helpers";

const updateSchema = z
  .object({
    status: z.string().optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD").optional(),
    horario: z.string().regex(/^\d{2}:\d{2}$/, "horario deve ser HH:mm").optional(),
  })
  .refine((v) => v.status !== undefined || v.data !== undefined || v.horario !== undefined, {
    message: "Informe status, data e/ou horario para atualizar",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return n8nError(parsed.error.errors[0]?.message ?? "Dados inválidos", 400);
    }

    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!existing) return n8nError("Agendamento não encontrado", 404);

    const data = parsed.data;
    let nextStatus = existing.status;

    if (data.status !== undefined) {
      const mapped = parseN8nStatus(data.status);
      if (!mapped || (mapped !== "CONFIRMED" && mapped !== "CANCELLED")) {
        return n8nError('status deve ser "confirmado" ou "cancelado"', 400);
      }
      nextStatus = mapped;
    }

    const dateStr = data.data ?? format(existing.date, "yyyy-MM-dd");
    const startTime = data.horario ?? existing.startTime;
    const rescheduling = data.data !== undefined || data.horario !== undefined;

    if (rescheduling && nextStatus !== "CANCELLED") {
      const available = await isSlotAvailable(dateStr, startTime, existing.service.durationMin, id);
      if (!available) {
        return n8nError(
          `Horário ${startTime} em ${dateStr} não está disponível para remarcar. Escolha outro horário.`,
          409
        );
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(data.data ? { date: parseIsoDateLocal(data.data) } : {}),
        ...(data.horario || data.data
          ? {
              startTime,
              endTime: calculateEndTime(startTime, existing.service.durationMin),
            }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true, phone: true, vehicleModel: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true } },
      },
    });

    return n8nOk(serializeAgendamento(appointment));
  } catch (error) {
    console.error("[n8n/agendamentos PATCH]", error);
    return n8nError("Erro ao atualizar agendamento", 500);
  }
}
