import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { serializeAgendamento } from "@/lib/n8n-helpers";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  const { id } = await params;

  try {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return n8nError("Agendamento não encontrado", 404);

    const appointment = await prisma.appointment.update({
      where: { id },
      data: { reminderSentAt: existing.reminderSentAt ?? new Date() },
      include: {
        client: { select: { id: true, name: true, phone: true, vehicleModel: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true } },
      },
    });

    return n8nOk(serializeAgendamento(appointment));
  } catch (error) {
    console.error("[n8n/lembretes-pendentes PATCH]", error);
    return n8nError("Erro ao marcar lembrete como enviado", 500);
  }
}
