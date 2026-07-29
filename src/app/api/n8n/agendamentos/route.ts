import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { calculateEndTime, isSlotAvailable } from "@/lib/appointments";
import { parseIsoDateLocal } from "@/lib/date-br";
import { normalizePhone } from "@/lib/utils";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import {
  findClientByPhone,
  mapPayment,
  serializeAgendamento,
} from "@/lib/n8n-helpers";
import { consultarAgendamentosCliente } from "@/lib/n8n-queries";

const createSchema = z.object({
  telefone_cliente: z.string().min(10, "telefone_cliente inválido"),
  veiculo: z.string().min(1, "veiculo é obrigatório"),
  porte: z.string().min(1, "porte é obrigatório"),
  servico_id: z.string().min(1, "servico_id é obrigatório"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD"),
  horario: z.string().regex(/^\d{2}:\d{2}$/, "horario deve ser HH:mm"),
  forma_pagamento: z.string().min(1, "forma_pagamento é obrigatória"),
  observacoes: z.string().optional().default(""),
});

export async function GET(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const telefone = request.nextUrl.searchParams.get("telefone");
    if (!telefone) return n8nError("Parâmetro telefone é obrigatório", 400);

    const result = await consultarAgendamentosCliente(telefone);
    if (!result.ok) return n8nError(result.error, result.status);
    return n8nOk(result.data);
  } catch (error) {
    console.error("[n8n/agendamentos GET]", error);
    return n8nError("Erro ao listar agendamentos", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return n8nError(parsed.error.errors[0]?.message ?? "Dados inválidos", 400);
    }

    const data = parsed.data;
    const phone = normalizePhone(data.telefone_cliente);

    const service = await prisma.service.findUnique({ where: { id: data.servico_id } });
    if (!service || !service.active) {
      return n8nError("Serviço não encontrado", 404);
    }

    const available = await isSlotAvailable(data.data, data.horario, service.durationMin);
    if (!available) {
      return n8nError(
        `Horário ${data.horario} em ${data.data} não está mais disponível. Escolha outro horário.`,
        409
      );
    }

    let client = await findClientByPhone(phone);
    if (!client) {
      client = await prisma.client.create({
        data: {
          phone,
          name: "Cliente",
          vehicleModel: data.veiculo,
        },
        include: {
          whatsappSessions: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: { step: true, lastStage: true, metadata: true },
          },
        },
      });
    } else {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { vehicleModel: data.veiculo },
        include: {
          whatsappSessions: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: { step: true, lastStage: true, metadata: true },
          },
        },
      });
    }

    const { paymentMethod, paymentGateway } = mapPayment(data.forma_pagamento);
    const notesParts = [
      `Porte: ${data.porte}`,
      `Veículo: ${data.veiculo}`,
      data.observacoes?.trim() ? data.observacoes.trim() : null,
    ].filter(Boolean);

    // Revalida imediatamente antes do create (reduz condição de corrida)
    const stillAvailable = await isSlotAvailable(data.data, data.horario, service.durationMin);
    if (!stillAvailable) {
      return n8nError(
        `Horário ${data.horario} em ${data.data} não está mais disponível. Escolha outro horário.`,
        409
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientId: client.id,
        serviceId: service.id,
        date: parseIsoDateLocal(data.data),
        startTime: data.horario,
        endTime: calculateEndTime(data.horario, service.durationMin),
        status: "CONFIRMED",
        notes: notesParts.join(" | "),
        source: "n8n",
        paymentMethod,
        paymentGateway,
        reminderSentAt: null,
        clientConfirmedAt: new Date(),
      },
      include: {
        client: { select: { id: true, name: true, phone: true, vehicleModel: true } },
        service: { select: { id: true, name: true, price: true, durationMin: true } },
      },
    });

    return n8nOk(serializeAgendamento(appointment), 201);
  } catch (error) {
    console.error("[n8n/agendamentos POST]", error);
    return n8nError("Erro ao criar agendamento", 500);
  }
}
