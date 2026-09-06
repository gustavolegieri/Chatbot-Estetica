/**
 * Cancelar e remarcar um agendamento já existente pela conversa.
 *
 * A confirmação da reserva promete "caso precise ajustar algo, responda por
 * aqui" e o resumo fala em cancelamento sem custo até 2 horas antes. Nada disso
 * existia: "quero cancelar meu agendamento" batia no listador de agendamentos
 * (`meu agendamento` é um dos padrões dele) e o cliente recebia a lista da
 * própria reserva com um "digite *menu*". Aqui ficam a leitura da intenção e as
 * duas operações, para o fluxo só decidir quando chamá-las.
 */
import { AppointmentStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";

export type AppointmentChangeIntent = "cancel" | "reschedule";

const PADROES_CANCELAR = [
  /\bcancelar?\b/i,
  /\bdesmarcar\b/i,
  /\bdesmarque\b/i,
  /n[ãa]o vou poder (ir|comparecer|levar)/i,
  /n[ãa]o consigo (ir|comparecer|levar)/i,
];

const PADROES_REMARCAR = [
  /\bremarcar\b/i,
  /\breagendar\b/i,
  /\badiar\b/i,
  /\bmudar (?:o |a )?(?:dia|data|hor[áa]rio)\b/i,
  /\btrocar (?:o |a )?(?:dia|data|hor[áa]rio)\b/i,
  /\bpassar para (?:outro|outra) (?:dia|data|hor[áa]rio)\b/i,
];

/**
 * Etapas em que faz sentido mexer numa reserva antiga.
 *
 * No meio de um orçamento, "cancelar" quer dizer desistir desta compra — quem
 * trata disso é o detector de cancelamento, que ainda oferece desconto. Só nas
 * etapas de descanso a frase fala do atendimento já marcado.
 */
const ETAPAS_DE_DESCANSO = new Set([
  "ETAPA1_AWAITING_NAME",
  "ETAPA2_MAIN_MENU",
  "ETAPA2_SUB",
  "ETAPA10_FAQ",
]);

export function stageAllowsAppointmentChange(stage: string): boolean {
  return ETAPAS_DE_DESCANSO.has(stage);
}

/**
 * Remarcar vem antes de cancelar de propósito: "quero cancelar e remarcar" é
 * um pedido de troca de horário, não de desistência.
 */
export function detectAppointmentChangeIntent(texto: string): AppointmentChangeIntent | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  if (PADROES_REMARCAR.some((padrao) => padrao.test(limpo))) return "reschedule";
  if (PADROES_CANCELAR.some((padrao) => padrao.test(limpo))) return "cancel";
  return null;
}

/** Próximo atendimento ativo do cliente, com serviço para montar a resposta. */
export async function fetchNextAppointment(phone: string) {
  return prisma.appointment.findFirst({
    where: {
      client: { phone: normalizePhone(phone) },
      status: {
        in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING],
      },
      date: { gte: startOfDay(new Date()) },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: { client: true, service: true },
  });
}

/**
 * Cancela e avisa a loja.
 *
 * O lançamento financeiro sai junto: ele nasce com a reserva, e mantê-lo
 * deixaria receita prevista de um atendimento que não vai acontecer. O aviso ao
 * cliente fica por conta do fluxo — `onAppointmentStatusChange` manda um texto
 * escrito para cancelamento feito pela equipe, que aqui soaria como resposta
 * automática ao próprio pedido dele.
 */
export async function cancelAppointmentFromBot(params: {
  appointmentId: string;
  motivo: string;
}) {
  const anterior = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    select: { notes: true },
  });

  const [, atualizado] = await prisma.$transaction([
    prisma.financialRecord.deleteMany({ where: { appointmentId: params.appointmentId } }),
    prisma.appointment.update({
      where: { id: params.appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: [anterior?.notes, params.motivo].filter(Boolean).join(" | "),
      },
      include: { client: true, service: true },
    }),
  ]);

  // Trilha de auditoria: quem pediu, quando e por quê. Sem ela, um horário que
  // some da agenda vira discussão — o painel mostra o estado, não a história.
  await prisma.auditLog
    .create({
      data: {
        action: "appointment.cancelled",
        resource: `appointment:${params.appointmentId}`,
        data: {
          motivo: params.motivo,
          responsavel: `whatsapp:${atualizado.client.phone}`,
          servico: atualizado.service.name,
          data: atualizado.date.toISOString(),
          horario: atualizado.startTime,
          canceladoEm: new Date().toISOString(),
        },
      },
    })
    .catch((error) => console.error("[Agendamento] Falha ao registrar auditoria:", error));

  try {
    const { notifyCancelledAppointment } = await import("./notifications");
    await notifyCancelledAppointment(atualizado, params.motivo);
  } catch (error) {
    console.error("[Agendamento] Falha isolada ao avisar a loja do cancelamento:", error);
  }

  return atualizado;
}
