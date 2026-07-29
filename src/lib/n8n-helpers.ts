import type { Appointment, AppointmentStatus, Client, PaymentGateway, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { normalizePhone } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

/** Status aceitos na API n8n (PT) → enum Prisma */
export const N8N_STATUS_TO_PRISMA: Record<string, AppointmentStatus> = {
  confirmado: "CONFIRMED",
  cancelado: "CANCELLED",
  confirmado_pendente: "PENDING",
  em_andamento: "IN_PROGRESS",
  concluido: "COMPLETED",
  no_show: "NO_SHOW",
};

/** Enum Prisma → status PT na API n8n */
export const PRISMA_STATUS_TO_N8N: Record<AppointmentStatus, string> = {
  CONFIRMED: "confirmado",
  CANCELLED: "cancelado",
  PENDING: "pendente",
  IN_PROGRESS: "em_andamento",
  COMPLETED: "concluido",
  NO_SHOW: "no_show",
};

export function parseN8nStatus(value: string): AppointmentStatus | null {
  const key = value.trim().toLowerCase();
  if (key in N8N_STATUS_TO_PRISMA) return N8N_STATUS_TO_PRISMA[key];
  const upper = value.trim().toUpperCase() as AppointmentStatus;
  if (upper in PRISMA_STATUS_TO_N8N) return upper;
  return null;
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

/** Combina data do agendamento + horário HH:mm em Date local */
export function appointmentDateTime(date: Date, startTime: string): Date {
  const d = new Date(date);
  const [h, m] = startTime.split(":").map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export function mapPayment(formaPagamento: string): {
  paymentMethod: string;
  paymentGateway: PaymentGateway;
} {
  const raw = formaPagamento.trim();
  const lower = raw.toLowerCase();

  if (lower.includes("pix")) {
    return { paymentMethod: raw, paymentGateway: "PIX" };
  }
  if (lower.includes("cart") || lower.includes("card") || lower.includes("crédito") || lower.includes("credito") || lower.includes("débito") || lower.includes("debito")) {
    return { paymentMethod: raw, paymentGateway: "CARD" };
  }
  if (lower.includes("dinheiro") || lower.includes("cash") || lower.includes("espécie") || lower.includes("especie")) {
    return { paymentMethod: raw, paymentGateway: "CASH" };
  }
  return { paymentMethod: raw, paymentGateway: "MANUAL" };
}

export type ClientWithSession = Client & {
  whatsappSessions: { step: string; lastStage: string | null; metadata: Prisma.JsonValue }[];
};

export function serializeCliente(client: ClientWithSession) {
  const session = client.whatsappSessions[0];
  const metadata =
    session?.metadata && typeof session.metadata === "object" && !Array.isArray(session.metadata)
      ? (session.metadata as Record<string, unknown>)
      : null;

  // Campos n8n ficam em metadata; fallback para lastStage do bot WhatsApp
  const estado =
    (typeof metadata?.estado_conversa === "string" ? metadata.estado_conversa : null) ??
    session?.lastStage ??
    null;

  let dados: Record<string, unknown> = {};
  if (metadata && "dados_conversa" in metadata) {
    const raw = metadata.dados_conversa;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      dados = raw as Record<string, unknown>;
    }
  }

  return {
    id: client.id,
    nome: client.name,
    telefone: client.phone,
    email: client.email,
    veiculo: client.vehicleModel,
    placa: client.vehiclePlate,
    estado_conversa: estado,
    dados_conversa: dados,
  };
}

export function serializeAgendamento(
  appointment: Appointment & {
    client?: Pick<Client, "id" | "name" | "phone" | "vehicleModel"> | null;
    service?: { id: string; name: string; price: Prisma.Decimal; durationMin: number } | null;
  }
) {
  return {
    id: appointment.id,
    status: PRISMA_STATUS_TO_N8N[appointment.status],
    data: format(appointment.date, "yyyy-MM-dd"),
    horario: appointment.startTime,
    horario_fim: appointment.endTime,
    forma_pagamento: appointment.paymentMethod,
    observacoes: appointment.notes,
    lembrete_enviado: appointment.reminderSentAt != null,
    lembrete_enviado_em: appointment.reminderSentAt?.toISOString() ?? null,
    cliente: appointment.client
      ? {
          id: appointment.client.id,
          nome: appointment.client.name,
          telefone: appointment.client.phone,
          veiculo: appointment.client.vehicleModel,
        }
      : undefined,
    servico: appointment.service
      ? {
          id: appointment.service.id,
          nome: appointment.service.name,
          preco_base: decimalToNumber(appointment.service.price),
          duracao_min: appointment.service.durationMin,
        }
      : undefined,
  };
}

/** Busca cliente por telefone (com e sem DDI 55) */
export async function findClientByPhone(telefone: string) {
  const phone = normalizePhone(telefone);
  if (!phone) return null;

  const variants = new Set<string>([phone]);
  if (phone.startsWith("55") && phone.length > 11) {
    variants.add(phone.slice(2));
  } else if (phone.length <= 11) {
    variants.add(`55${phone}`);
  }

  return prisma.client.findFirst({
    where: { phone: { in: [...variants] } },
    include: {
      whatsappSessions: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: { step: true, lastStage: true, metadata: true },
      },
    },
  });
}

/**
 * Atualiza (ou cria) a sessão WhatsApp do telefone com estado/dados do fluxo n8n.
 * Guarda em metadata.estado_conversa e metadata.dados_conversa para não conflitar com o bot.
 */
export async function upsertConversationState(
  phone: string,
  opts: { estado_conversa?: string; dados_conversa?: Record<string, unknown>; clientId?: string }
) {
  const normalized = normalizePhone(phone);
  const existing = await prisma.whatsAppSession.findUnique({ where: { phone: normalized } });
  const prevMeta =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const nextMeta: Record<string, unknown> = { ...prevMeta };
  if (opts.estado_conversa !== undefined) {
    nextMeta.estado_conversa = opts.estado_conversa;
  }
  if (opts.dados_conversa !== undefined) {
    nextMeta.dados_conversa = opts.dados_conversa;
  }

  return prisma.whatsAppSession.upsert({
    where: { phone: normalized },
    create: {
      phone: normalized,
      clientId: opts.clientId,
      lastStage: opts.estado_conversa ?? null,
      metadata: nextMeta as Prisma.InputJsonValue,
    },
    update: {
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      ...(opts.estado_conversa !== undefined ? { lastStage: opts.estado_conversa } : {}),
      metadata: nextMeta as Prisma.InputJsonValue,
    },
  });
}
