import { NotificationSetting } from "@prisma/client";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import type { Appointment, Client, Service } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logAudit } from "./audit";

type AptFull = Appointment & { client: Client; service: Service };

type Settings = NotificationSetting | null;

async function getSettings(): Promise<Settings> {
  return prisma.notificationSetting.findUnique({ where: { id: "default" } });
}

function shouldSend(settings: Settings, key: keyof NotificationSetting): boolean {
  if (!settings) return false;
  return Boolean((settings as any)[key]);
}

async function getBusinessPhone(): Promise<string | null> {
  const runtime = await prisma.settings.findUnique({ where: { id: "default" } });
  return runtime?.businessPhone ?? null;
}

async function sendEmailOrSkip(opts: {
  to: string;
  subject: string;
  text: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    console.warn("[notifications] SMTP não configurado, email skip");
    return { skipped: true };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });

    return { skipped: false };
  } catch (err) {
    console.error("[notifications] erro enviando email", err);
    return { skipped: true, error: String(err) };
  }
}

export async function notifyNewAppointment(apt: AptFull) {
  const settings = await getSettings();
  if (!shouldSend(settings, "notifyNewAppointment")) return;

  const businessPhone = await getBusinessPhone();
  if (!businessPhone) return;

  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });

  const text = [
    `📅 *Novo agendamento*`,
    `Cliente: *${apt.client.name}*`,
    `Serviço: *${apt.service.name}*`,
    `Quando: *${dateLabel}* às *${apt.startTime}*`,
  ].join("\n");

  await sendText({
    number: businessPhone,
    text,
    sender: "ADMIN",
    flowStage: "NOTIFY_NEW_APPOINTMENT",
  }).catch(() => {});

  if (settings?.notifyByEmail && apt.client.email) {
    await sendEmailOrSkip({
      to: apt.client.email,
      subject: "Novo agendamento",
      text,
    });
  }

  await logAudit({
    action: "notify_new_appointment",
    resource: apt.id,
    data: { phone: businessPhone, appointmentId: apt.id },
  }).catch(() => {});
}

export async function notifyClientHandoff(params: {
  phone: string;
  reason: string;
  clientName?: string;
}) {
  const settings = await getSettings();
  if (!shouldSend(settings, "notifyClientHandoff")) return;

  const businessPhone = await getBusinessPhone();
  if (!businessPhone) return;

  const text = [
    `💬 *Cliente pediu atendimento humano*`,
    params.clientName ? `Cliente: *${params.clientName}*` : undefined,
    `Motivo: ${params.reason}`,
  ].filter(Boolean).join("\n");

  await sendText({
    number: businessPhone,
    text,
    sender: "ADMIN",
    flowStage: "NOTIFY_HANDOFF",
  }).catch(() => {});

  if (settings?.notifyByEmail) {
    const client = await prisma.client.findUnique({ where: { phone: params.phone } });
    if (client?.email) {
      await sendEmailOrSkip({
        to: client.email,
        subject: "Atendimento humano solicitado",
        text,
      });
    }
  }

  await logAudit({
    action: "notify_client_handoff",
    resource: params.phone,
    data: params,
  }).catch(() => {});
}

export async function notifyCancelledAppointment(apt: AptFull, reason: string) {
  const settings = await getSettings();
  if (!shouldSend(settings, "notifyCancelledAppointment")) return;

  const businessPhone = await getBusinessPhone();
  if (!businessPhone) return;

  const dateLabel = format(apt.date, "dd/MM (EEEE)", { locale: ptBR });

  const text = [
    `❌ *Agendamento cancelado*`,
    `Cliente: *${apt.client.name}*`,
    `Serviço: *${apt.service.name}*`,
    `Quando: *${dateLabel}* às *${apt.startTime}*`,
    `Motivo: ${reason}`,
  ].join("\n");

  await sendText({
    number: businessPhone,
    text,
    sender: "ADMIN",
    flowStage: "NOTIFY_CANCELLED",
  }).catch(() => {});

  if (settings?.notifyByEmail && apt.client.email) {
    await sendEmailOrSkip({
      to: apt.client.email,
      subject: "Agendamento cancelado",
      text,
    });
  }

  await logAudit({
    action: "notify_cancelled_appointment",
    resource: apt.id,
    data: { phone: businessPhone, reason },
  }).catch(() => {});
}

export async function notifyMonthlyGoalIfNeeded() {
  const settings = await getSettings();
  if (!settings?.notifyMonthlyGoal) return;
  if (!settings.monthlyGoalAmount || Number(settings.monthlyGoalAmount) <= 0) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const agg = await prisma.financialRecord.aggregate({
    where: { type: "INCOME", date: { gte: monthStart, lte: monthEnd } },
    _sum: { amount: true },
  });

  const revenue = Number(agg._sum.amount ?? 0);
  const goal = Number(settings.monthlyGoalAmount);

  if (revenue < goal) return;

  const already = await prisma.auditLog.count({
    where: {
      action: "notify_monthly_goal_reached",
      resource: "default",
    },
  });

  if (already > 0) return;

  const text = [
    `🎯 *Meta mensal atingida!*`,
    `Meta: *R$ ${goal}*`,
    `Receita no mês: *R$ ${revenue}*`,
  ].join("\n");

  const businessPhone = await getBusinessPhone();
  if (businessPhone) {
    await sendText({
      number: businessPhone,
      text,
      sender: "ADMIN",
      flowStage: "NOTIFY_MONTHLY_GOAL",
    }).catch(() => {});
  }

  await logAudit({
    action: "notify_monthly_goal_reached",
    resource: "default",
    data: { goal, revenue },
  }).catch(() => {});
}

