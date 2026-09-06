/**
 * Motor de recorrência: reengaja clientes pelo tempo decorrido desde o último
 * serviço concluído, e avisa quando a garantia de um serviço está por vencer.
 *
 * O custo de aquisição aqui é zero — a base já é da casa —, então a regra é ser
 * conservador. Um cliente só entra na fila quando:
 *   - tem um atendimento CONCLUÍDO cujo serviço já passou do intervalo,
 *   - não tem nenhum agendamento ativo no futuro,
 *   - não recebeu outra mensagem de recorrência dentro da janela de silêncio,
 *   - e aquele atendimento-âncora nunca gerou um contato antes.
 *
 * Existe ainda um teto diário (`Settings.recurrenceMaxPerDay`) e uma janela de
 * horário, para que o disparo nunca pareça uma lista de transmissão.
 */

import { AppointmentStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { isPhoneBlocked } from "./blocked-phones";
import { loadPromptMap, renderPrompt } from "./bot-prompts";
import { sendText } from "./evolution-api";
import { wasMessageSent } from "./appointment-whatsapp";

const SP_TZ = "America/Sao_Paulo";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Não faz sentido cobrar retorno de um serviço feito há anos. */
const MAX_LOOKBACK_DAYS = 1095;
/** Aviso de garantia começa a este número de dias do vencimento. */
export const WARRANTY_NOTICE_DAYS = 15;
export const RECURRENCE_AUDIT_ACTION = "RECURRENCE_SENT";

export type RecurrenceKind = "due" | "warranty";

/**
 * Intervalo inferido pelo nome do serviço quando `Service.recurrenceDays` está
 * vazio. Serve para o motor funcionar sem configuração prévia; qualquer serviço
 * pode sobrescrever o valor no cadastro. Sem correspondência, o serviço fica de
 * fora — é melhor não contatar do que inventar uma periodicidade.
 */
const RECURRENCE_KEYWORD_DAYS: Array<[RegExp, number]> = [
  [/vitrific|cer[âa]mic|ceramic|coating|selante|cristaliza/i, 365],
  [/polimento|corte\s|revitaliza|farol/i, 180],
  [/higieniz|estofad|couro|sanitiz|interna/i, 180],
  [/enceramento|\bcera\b/i, 90],
  [/lavagem|lava[çc][ãa]o|higi[êe]nica|completa|detalhada|simples/i, 21],
];

/** Intervalo recomendado do serviço: cadastro primeiro, catálogo como apoio. */
export function resolveRecurrenceDays(service: {
  recurrenceDays?: number | null;
  name: string;
}): number | null {
  if (typeof service.recurrenceDays === "number" && service.recurrenceDays > 0) {
    return service.recurrenceDays;
  }
  for (const [pattern, days] of RECURRENCE_KEYWORD_DAYS) {
    if (pattern.test(service.name)) return days;
  }
  return null;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export type RecurrenceClassification =
  | { eligible: false; daysSince: number }
  | {
      eligible: true;
      kind: RecurrenceKind;
      daysSince: number;
      intervalDays: number;
      /** Dias de atraso em relação ao intervalo (0 quando é aviso de garantia). */
      overdueDays: number;
      /** Dias restantes de garantia; negativo quando já venceu. */
      warrantyEndsInDays: number | null;
    };

/**
 * Decide se um atendimento concluído virou motivo de contato. O aviso de
 * garantia tem prioridade porque tem prazo: depois que vence, perde o sentido.
 */
export function classifyRecurrence(input: {
  lastServiceAt: Date;
  now: Date;
  intervalDays: number | null;
  warrantyDays?: number | null;
}): RecurrenceClassification {
  const daysSince = daysBetween(input.lastServiceAt, input.now);
  if (daysSince < 0) return { eligible: false, daysSince };

  const warrantyDays =
    typeof input.warrantyDays === "number" && input.warrantyDays > 0 ? input.warrantyDays : null;
  const warrantyEndsInDays = warrantyDays === null ? null : warrantyDays - daysSince;

  if (
    warrantyEndsInDays !== null &&
    warrantyEndsInDays >= 0 &&
    warrantyEndsInDays <= WARRANTY_NOTICE_DAYS
  ) {
    return {
      eligible: true,
      kind: "warranty",
      daysSince,
      intervalDays: warrantyDays as number,
      overdueDays: 0,
      warrantyEndsInDays,
    };
  }

  const intervalDays =
    typeof input.intervalDays === "number" && input.intervalDays > 0 ? input.intervalDays : null;
  if (intervalDays === null || daysSince < intervalDays) {
    return { eligible: false, daysSince };
  }

  return {
    eligible: true,
    kind: "due",
    daysSince,
    intervalDays,
    overdueDays: daysSince - intervalDays,
    warrantyEndsInDays,
  };
}

/** HH:mm local de São Paulo. Local para manter este módulo leve nos testes. */
export function hhmmInSaoPaulo(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${hour}:${get("minute")}`;
}

/** Janela de envio; aceita apenas intervalos no mesmo dia (ex.: 09:00–19:00). */
export function isWithinSendWindow(now: Date, start: string, end: string): boolean {
  const current = hhmmInSaoPaulo(now);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return true;
  if (start >= end) return true;
  return current >= start && current <= end;
}

export type RecurrenceCandidate = {
  appointmentId: string;
  clientId: string;
  clientName: string;
  phone: string;
  vehicle: string | null;
  serviceId: string;
  serviceName: string;
  lastServiceAt: Date;
  kind: RecurrenceKind;
  daysSince: number;
  intervalDays: number;
  overdueDays: number;
  warrantyEndsInDays: number | null;
};

/** Ordena por urgência: garantia vencendo antes, depois o mais atrasado. */
export function rankCandidates(candidates: RecurrenceCandidate[]): RecurrenceCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "warranty" ? -1 : 1;
    if (a.kind === "warranty" && b.kind === "warranty") {
      return (a.warrantyEndsInDays ?? 0) - (b.warrantyEndsInDays ?? 0);
    }
    return b.overdueDays - a.overdueDays;
  });
}

/** Um contato por cliente por execução, mantendo o motivo mais urgente. */
export function dedupeByClient(candidates: RecurrenceCandidate[]): RecurrenceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.clientId)) return false;
    seen.add(candidate.clientId);
    return true;
  });
}

/**
 * Monta a fila de contatos. Não checa `recurrenceEnabled` de propósito: o painel
 * precisa conseguir simular a fila antes de ligar a automação.
 */
export async function findRecurrenceCandidates(opts?: {
  now?: Date;
  limit?: number;
  quietDays?: number;
}): Promise<RecurrenceCandidate[]> {
  const now = opts?.now ?? new Date();
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const quietDays = opts?.quietDays ?? settings?.recurrenceQuietDays ?? 45;
  const limit = opts?.limit ?? settings?.recurrenceMaxPerDay ?? 10;

  const [completed, activeAppointments, recentContacts] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.COMPLETED,
        date: { gte: new Date(now.getTime() - MAX_LOOKBACK_DAYS * DAY_MS) },
      },
      include: { client: true, service: true },
      orderBy: { date: "desc" },
    }),
    prisma.appointment.findMany({
      where: {
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS],
        },
        date: { gte: new Date(now.getTime() - DAY_MS) },
      },
      select: { clientId: true },
    }),
    prisma.auditLog.findMany({
      where: {
        action: RECURRENCE_AUDIT_ACTION,
        createdAt: { gte: new Date(now.getTime() - quietDays * DAY_MS) },
      },
      select: { resource: true },
    }),
  ]);

  const busyClients = new Set(activeAppointments.map((item) => item.clientId));
  const recentlyContacted = new Set(
    recentContacts.map((item) => item.resource.replace(/^client:/, ""))
  );

  const candidates: RecurrenceCandidate[] = [];
  const anchorSeen = new Set<string>();

  for (const appointment of completed) {
    // `completed` vem ordenado do mais recente para o mais antigo, então o
    // primeiro par cliente+serviço encontrado já é a última execução.
    const anchorKey = `${appointment.clientId}:${appointment.serviceId}`;
    if (anchorSeen.has(anchorKey)) continue;
    anchorSeen.add(anchorKey);

    // A checagem vem depois do dedupe de propósito: uma âncora já contatada
    // encerra o assunto daquele par cliente+serviço. Filtrar na query faria a
    // execução anterior virar âncora e a mensagem citaria uma data antiga.
    if (appointment.recurrenceNotifiedAt) continue;
    if (busyClients.has(appointment.clientId)) continue;
    if (recentlyContacted.has(appointment.clientId)) continue;
    if (!appointment.client.phone) continue;

    const classification = classifyRecurrence({
      lastServiceAt: appointment.date,
      now,
      intervalDays: resolveRecurrenceDays(appointment.service),
      warrantyDays: appointment.service.warrantyDays,
    });
    if (!classification.eligible) continue;

    candidates.push({
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      clientName: appointment.client.name,
      phone: appointment.client.phone,
      vehicle: appointment.client.vehicleModel,
      serviceId: appointment.serviceId,
      serviceName: appointment.service.name,
      lastServiceAt: appointment.date,
      kind: classification.kind,
      daysSince: classification.daysSince,
      intervalDays: classification.intervalDays,
      overdueDays: classification.overdueDays,
      warrantyEndsInDays: classification.warrantyEndsInDays,
    });
  }

  return dedupeByClient(rankCandidates(candidates)).slice(0, Math.max(0, limit));
}

/** Texto em português para "faz X tempo", usado no corpo da mensagem. */
export function humanizeElapsed(days: number): string {
  if (days < 45) return `${days} dias`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} meses`;
  const years = Math.floor(days / 365);
  const restMonths = Math.round((days - years * 365) / 30);
  if (!restMonths) return years === 1 ? "1 ano" : `${years} anos`;
  return `${years} ${years === 1 ? "ano" : "anos"} e ${restMonths} ${restMonths === 1 ? "mês" : "meses"}`;
}

export type RecurrenceRunResult = {
  ok: boolean;
  dryRun: boolean;
  reason?: "disabled" | "whatsapp-off" | "outside-window";
  considered: number;
  sent: number;
  blocked: number;
  failed: number;
  candidates: Array<Pick<RecurrenceCandidate, "clientName" | "serviceName" | "kind" | "daysSince"> & {
    sent: boolean;
  }>;
};

export async function runRecurrenceCampaign(opts?: {
  now?: Date;
  dryRun?: boolean;
  limit?: number;
}): Promise<RecurrenceRunResult> {
  const now = opts?.now ?? new Date();
  const dryRun = opts?.dryRun ?? false;
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  const empty = (reason: RecurrenceRunResult["reason"]): RecurrenceRunResult => ({
    ok: true,
    dryRun,
    reason,
    considered: 0,
    sent: 0,
    blocked: 0,
    failed: 0,
    candidates: [],
  });

  if (!dryRun) {
    if (!settings?.recurrenceEnabled) return empty("disabled");
    if (!settings.whatsappEnabled) return empty("whatsapp-off");
    if (
      !isWithinSendWindow(
        now,
        settings.recurrenceWindowStart ?? "09:00",
        settings.recurrenceWindowEnd ?? "19:00"
      )
    ) {
      return empty("outside-window");
    }
  }

  const candidates = await findRecurrenceCandidates({ now, limit: opts?.limit });
  const prompts = await loadPromptMap();
  const brand = settings?.businessName ?? "Garagem do Ka";

  let sent = 0;
  let blocked = 0;
  let failed = 0;
  const report: RecurrenceRunResult["candidates"] = [];

  for (const candidate of candidates) {
    try {
      if (await isPhoneBlocked(candidate.phone)) {
        blocked += 1;
        report.push({ ...summarize(candidate), sent: false });
        continue;
      }

      const text = renderPrompt(prompts, promptKeyFor(candidate.kind), {
        name: candidate.clientName.split(" ")[0] || candidate.clientName,
        brand,
        service: candidate.serviceName,
        vehicle: candidate.vehicle ?? "seu veículo",
        elapsed: humanizeElapsed(candidate.daysSince),
        warrantyDays: String(candidate.warrantyEndsInDays ?? 0),
      });

      if (dryRun) {
        report.push({ ...summarize(candidate), sent: false });
        continue;
      }

      const delivered = wasMessageSent(await sendText({ number: candidate.phone, text }));
      if (!delivered) {
        failed += 1;
        report.push({ ...summarize(candidate), sent: false });
        continue;
      }

      // Marcar a âncora impede um segundo contato pelo mesmo atendimento,
      // mesmo que o cliente siga sem voltar.
      await prisma.appointment.update({
        where: { id: candidate.appointmentId },
        data: { recurrenceNotifiedAt: now },
      });
      await logAudit({
        action: RECURRENCE_AUDIT_ACTION,
        resource: `client:${candidate.clientId}`,
        data: {
          appointmentId: candidate.appointmentId,
          serviceName: candidate.serviceName,
          kind: candidate.kind,
          daysSince: candidate.daysSince,
          intervalDays: candidate.intervalDays,
        },
      });
      sent += 1;
      report.push({ ...summarize(candidate), sent: true });
    } catch (error) {
      failed += 1;
      report.push({ ...summarize(candidate), sent: false });
      console.error("[Recorrência] Falha ao contatar cliente:", candidate.clientId, error);
    }
  }

  return { ok: true, dryRun, considered: candidates.length, sent, blocked, failed, candidates: report };
}

function summarize(candidate: RecurrenceCandidate) {
  return {
    clientName: candidate.clientName,
    serviceName: candidate.serviceName,
    kind: candidate.kind,
    daysSince: candidate.daysSince,
  };
}

function promptKeyFor(kind: RecurrenceKind): string {
  return kind === "warranty" ? "recurrence_warranty" : "recurrence_due";
}
