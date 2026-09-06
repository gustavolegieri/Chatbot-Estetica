/**
 * Caminho rápido para quem já é cliente.
 *
 * O fluxo completo leva ~15 respostas do cliente até a reserva — muito para um
 * serviço recorrente de ticket baixo. Quem já comprou tem nome, veículo e
 * histórico salvos, então não precisa navegar o menu de novo: recebe direto uma
 * oferta com o último serviço e os próximos horários livres, e fecha em uma
 * resposta.
 *
 * Este módulo só monta a oferta e interpreta a escolha; quem cria a reserva
 * continua sendo o `confirmFinal` do fluxo, para não existir um segundo caminho
 * de gravação de agendamento.
 */

import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { generateAvailableSlots } from "./appointments";
import { normalizePhone } from "./utils";

/** Quantos dias à frente procurar horário antes de desistir da oferta. */
const DIAS_DE_BUSCA = 10;
/** Quantas opções mostrar. Três cabe na tela sem virar lista. */
export const MAX_OPCOES = 3;
/** Não oferecer repetição se o último serviço foi ontem. */
const DIAS_MINIMOS_DESDE_O_ULTIMO = 2;

export type RepeatSlot = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** "sexta, 05/09" */
  label: string;
};

export type RepeatOffer = {
  serviceId: string;
  serviceName: string;
  serviceDurationMin: number;
  servicePrice: number;
  vehicleLabel: string;
  /** Campos separados para reidratar o estado do fluxo sem reparsear o rótulo. */
  vehicleModel: string | null;
  vehiclePlate: string | null;
  lastVisitAt: Date;
  slots: RepeatSlot[];
};

const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** Rótulo curto e sem ambiguidade: "sexta, 05/09". */
export function slotLabel(dateStr: string, hoje = new Date()): string {
  const [ano, mes, dia] = dateStr.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diffDias = Math.round(
    (data.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) /
      86_400_000
  );
  const curta = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
  if (diffDias === 0) return `hoje, ${curta}`;
  if (diffDias === 1) return `amanhã, ${curta}`;
  return `${DIAS_SEMANA[data.getDay()]}, ${curta}`;
}

function isoDoDia(base: Date, somaDias: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + somaDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Ordena os horários do dia priorizando os próximos do horário da última
 * visita — quem foi de manhã costuma preferir de manhã.
 */
export function ordenarPorPreferencia(slots: string[], horarioPreferido?: string | null): string[] {
  if (!horarioPreferido || !/^\d{2}:\d{2}$/.test(horarioPreferido)) return slots;
  const alvo = Number(horarioPreferido.slice(0, 2)) * 60 + Number(horarioPreferido.slice(3));
  return [...slots].sort((a, b) => {
    const ma = Number(a.slice(0, 2)) * 60 + Number(a.slice(3));
    const mb = Number(b.slice(0, 2)) * 60 + Number(b.slice(3));
    return Math.abs(ma - alvo) - Math.abs(mb - alvo);
  });
}

/**
 * Monta a oferta de repetição, ou `null` quando não faz sentido oferecer
 * (cliente novo, já tem reserva ativa, serviço inativo, sem horário livre).
 */
export async function buildRepeatOffer(phone: string, agora = new Date()): Promise<RepeatOffer | null> {
  const normalizado = normalizePhone(phone);

  const client = await prisma.client.findUnique({
    where: { phone: normalizado },
    select: { id: true, vehicleModel: true, vehiclePlate: true },
  });
  if (!client) return null;

  // Já tem algo marcado à frente: oferecer outra reserva só confundiria.
  const ativo = await prisma.appointment.count({
    where: {
      clientId: client.id,
      date: { gte: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()) },
      status: {
        in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS],
      },
    },
  });
  if (ativo > 0) return null;

  // Qualquer atendimento que de fato aconteceu serve de referência: filtrar só
  // por COMPLETED deixava de fora quem tem a agenda marcada como CONFIRMED ou
  // IN_PROGRESS e nunca foi fechada pelo painel — a maioria dos casos reais.
  const ultimo = await prisma.appointment.findFirst({
    where: {
      clientId: client.id,
      date: { lt: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()) },
      status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
    },
    orderBy: { date: "desc" },
    include: { service: true },
  });
  if (!ultimo || !ultimo.service.active) return null;

  const diasDesde = Math.floor((agora.getTime() - ultimo.date.getTime()) / 86_400_000);
  if (diasDesde < DIAS_MINIMOS_DESDE_O_ULTIMO) return null;

  const duracao = ultimo.service.durationMin || 60;
  const slots: RepeatSlot[] = [];
  for (let i = 0; i <= DIAS_DE_BUSCA && slots.length < MAX_OPCOES; i++) {
    const dia = isoDoDia(agora, i);
    let livres: string[] = [];
    try {
      livres = await generateAvailableSlots(dia, duracao);
    } catch (error) {
      console.error("[Oferta de repetição] Falha ao buscar horários de", dia, error);
      continue;
    }
    if (!livres.length) continue;
    // No próprio dia, descarta horários que já passaram.
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();
    const validos = (i === 0
      ? livres.filter((h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) > agoraMin + 60)
      : livres);
    for (const hora of ordenarPorPreferencia(validos, ultimo.startTime)) {
      if (slots.length >= MAX_OPCOES) break;
      slots.push({ date: dia, time: hora, label: slotLabel(dia, agora) });
    }
  }
  if (!slots.length) return null;

  const vehicleLabel = [client.vehicleModel, client.vehiclePlate].filter(Boolean).join(" · ") || "seu veículo";

  return {
    serviceId: ultimo.serviceId,
    serviceName: ultimo.service.name,
    serviceDurationMin: duracao,
    servicePrice: Number(ultimo.finalPrice ?? ultimo.service.price),
    vehicleLabel,
    vehicleModel: client.vehicleModel,
    vehiclePlate: client.vehiclePlate,
    lastVisitAt: ultimo.date,
    slots,
  };
}

function precoBr(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

/** Texto da oferta. Separado da busca para poder ser testado sem banco. */
export function formatRepeatOffer(oferta: RepeatOffer, nome: string): string {
  const linhas = [
    `Oi, *${nome}*! 👋`,
    "",
    `Da última vez foi *${oferta.serviceName}* no *${oferta.vehicleLabel}*.`,
    `Quer repetir? Tenho estes horários — ${precoBr(oferta.servicePrice)}:`,
    "",
  ];
  oferta.slots.forEach((slot, i) => {
    linhas.push(`*${i + 1}* 📅 ${slot.label} às *${slot.time}*`);
  });
  linhas.push("");
  linhas.push("*4* 🔧 Outro serviço  ·  *5* 🕒 Outro horário");
  linhas.push("");
  linhas.push("_Responda com o número e já deixo reservado._");
  return linhas.join("\n");
}

export type RepeatChoice =
  | { kind: "slot"; slot: RepeatSlot }
  | { kind: "other-service" }
  | { kind: "other-time" }
  | { kind: "unknown" };

/** Interpreta a resposta do cliente à oferta. */
export function parseRepeatChoice(input: string, oferta: RepeatOffer): RepeatChoice {
  const t = input.trim().toLowerCase();

  const numero = Number(t.match(/^(\d)/)?.[1]);
  if (numero >= 1 && numero <= oferta.slots.length) {
    return { kind: "slot", slot: oferta.slots[numero - 1] };
  }
  if (numero === 4 || /outro servi[çc]o|outra coisa|mudar servi[çc]o/.test(t)) {
    return { kind: "other-service" };
  }
  if (numero === 5 || /outro hor[áa]rio|outra data|outro dia|ver dias|calend[áa]rio/.test(t)) {
    return { kind: "other-time" };
  }
  if (/^(sim|isso|pode ser|quero|confirmo|ok)$/.test(t) && oferta.slots.length) {
    // "sim" sem número: assume a primeira opção, que é a mais próxima.
    return { kind: "slot", slot: oferta.slots[0] };
  }
  return { kind: "unknown" };
}
