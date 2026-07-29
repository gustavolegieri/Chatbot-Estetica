import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/appointments";
import {
  appointmentDateTime,
  decimalToNumber,
  findClientByPhone,
  serializeAgendamento,
  serializeCliente,
} from "@/lib/n8n-helpers";

/** Lista serviços ativos com preços e variação por porte */
export async function listServicosPrecos() {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: [{ categoryNum: "asc" }, { menuOrder: "asc" }, { name: "asc" }],
  });

  return services.map((s) => ({
    id: s.id,
    nome: s.name,
    descricao: s.description,
    preco_base: decimalToNumber(s.price),
    duracao_min: s.durationMin,
    precos_por_porte: {
      hatch: {
        min: decimalToNumber(s.priceHatchMin),
        max: decimalToNumber(s.priceHatchMax),
      },
      suv: {
        min: decimalToNumber(s.priceSuvMin),
        max: decimalToNumber(s.priceSuvMax),
      },
    },
  }));
}

/** Horários livres em uma data (YYYY-MM-DD) */
export async function consultarDisponibilidade(dateStr: string, servicoId?: string) {
  let durationMin: number;

  if (servicoId) {
    const service = await prisma.service.findUnique({ where: { id: servicoId } });
    if (!service) {
      return { error: "Serviço não encontrado" as const, status: 404 as const };
    }
    durationMin = service.durationMin;
  } else {
    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    durationMin = settings?.slotDurationMin ?? 60;
  }

  const horarios = await getAvailableSlots(dateStr, durationMin);

  return {
    data: {
      data: dateStr,
      duracao_min: durationMin,
      horarios,
    },
  };
}

/** Agendamentos futuros (não cancelados) de um cliente */
export async function consultarAgendamentosCliente(telefone: string) {
  const client = await findClientByPhone(telefone);
  if (!client) {
    return { error: "Cliente não encontrado" as const, status: 404 as const };
  }

  const now = new Date();
  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: client.id,
      status: { not: "CANCELLED" },
    },
    include: {
      client: { select: { id: true, name: true, phone: true, vehicleModel: true } },
      service: { select: { id: true, name: true, price: true, durationMin: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const futuros = appointments.filter((a) => appointmentDateTime(a.date, a.startTime) >= now);

  return { data: futuros.map(serializeAgendamento) };
}

/**
 * Dados do cliente + estado/dados de conversa.
 * Se não existir, retorna cliente_novo: true (sem erro).
 */
export async function consultarCliente(telefone: string) {
  const client = await findClientByPhone(telefone);
  if (!client) {
    return {
      data: {
        cliente_novo: true as const,
        telefone,
        mensagem: "Cliente não cadastrado — tratar como cliente novo.",
      },
    };
  }

  return {
    data: {
      cliente_novo: false as const,
      ...serializeCliente(client),
    },
  };
}
