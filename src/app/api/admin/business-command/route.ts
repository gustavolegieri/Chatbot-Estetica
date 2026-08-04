import { NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY);

  const [todayAppointments, conversations, queue, appointments60d, finance60d, clients, settings] = await Promise.all([
    prisma.appointment.findMany({
      where: { date: { gte: todayStart, lte: todayEnd }, status: { not: "CANCELLED" } },
      include: { client: true, service: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.whatsAppSession.findMany({
      where: {
        OR: [
          { handoffStatus: { in: ["PENDING", "IN_PROGRESS"] } },
          { unreadCount: { gt: 0 } },
        ],
        NOT: [{ phone: "" }, { phone: { startsWith: "test-" } }],
      },
      include: { client: true },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
    prisma.outboundMessageQueue.findMany({
      where: { processedAt: null },
      orderBy: { scheduledFor: "asc" },
      take: 80,
      select: { id: true, phone: true, attempts: true, maxAttempts: true, scheduledFor: true, isDailyLimit: true, error: true },
    }),
    prisma.appointment.findMany({
      where: { createdAt: { gte: sixtyDaysAgo } },
      select: {
        id: true,
        createdAt: true,
        date: true,
        status: true,
        source: true,
        finalPrice: true,
        paymentStatus: true,
        clientId: true,
        service: { select: { id: true, name: true, price: true } },
      },
    }),
    prisma.financialRecord.findMany({
      where: { date: { gte: sixtyDaysAgo } },
      select: { type: true, amount: true, date: true },
    }),
    prisma.client.findMany({
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: {
        id: true,
        name: true,
        phone: true,
        vehicleModel: true,
        createdAt: true,
        appointments: {
          where: { status: { not: "CANCELLED" } },
          orderBy: { date: "desc" },
          take: 1,
          select: { date: true, status: true, service: { select: { name: true } } },
        },
        whatsappSessions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { metadata: true },
        },
      },
    }),
    prisma.settings.findUnique({
      where: { id: "default" },
      select: { whatsappEnabled: true, testModeEnabled: true, businessHoursStart: true, businessHoursEnd: true },
    }),
  ]);

  const currentAppointments = appointments60d.filter((item) => item.createdAt >= thirtyDaysAgo);
  const previousAppointments = appointments60d.filter((item) => item.createdAt < thirtyDaysAgo);
  const currentFinance = finance60d.filter((item) => item.date >= thirtyDaysAgo);
  const previousFinance = finance60d.filter((item) => item.date < thirtyDaysAgo);
  const revenue = currentFinance.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + Number(item.amount), 0);
  const previousRevenue = previousFinance.filter((item) => item.type === "INCOME").reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = currentFinance.filter((item) => item.type === "EXPENSE").reduce((sum, item) => sum + Number(item.amount), 0);
  const completed = currentAppointments.filter((item) => item.status === "COMPLETED");
  const active = currentAppointments.filter((item) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status));
  const totalFinalValue = currentAppointments.reduce((sum, item) => sum + Number(item.finalPrice ?? item.service.price), 0);

  const serviceMap = new Map<string, { id: string; name: string; bookings: number; value: number }>();
  for (const item of currentAppointments) {
    const current = serviceMap.get(item.service.id) ?? { id: item.service.id, name: item.service.name, bookings: 0, value: 0 };
    current.bookings += 1;
    current.value += Number(item.finalPrice ?? item.service.price);
    serviceMap.set(item.service.id, current);
  }

  const sourceMap = new Map<string, number>();
  for (const item of currentAppointments) sourceMap.set(item.source || "admin", (sourceMap.get(item.source || "admin") ?? 0) + 1);

  const retention = clients.filter((client) => /^\d{10,15}$/.test(client.phone.replace(/\D/g, ""))).map((client) => {
    const latest = client.appointments[0];
    const metadata = client.whatsappSessions[0]?.metadata;
    const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
    const daysSince = latest ? Math.max(0, Math.floor((now.getTime() - latest.date.getTime()) / DAY)) : null;
    const segment = daysSince === null ? "never" : daysSince >= 90 ? "90+" : daysSince >= 60 ? "60-89" : daysSince >= 30 ? "30-59" : "active";
    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      marketingConsent: metadataRecord.marketingConsent === true,
      vehicle: client.vehicleModel,
      lastService: latest?.service.name ?? null,
      lastVisitAt: latest?.date ?? null,
      daysSince,
      segment,
      href: `/admin/atendimento?phone=${encodeURIComponent(client.phone)}`,
    };
  });

  const pendingPayments = todayAppointments.filter((item) => item.paymentStatus === "PENDING");
  const pendingConfirmations = todayAppointments.filter((item) => item.status === "PENDING");

  return NextResponse.json({
    success: true,
    data: {
      operation: {
        score: Math.max(0, 100 - conversations.length * 3 - queue.filter((item) => !item.isDailyLimit).length * 2 - queue.filter((item) => item.isDailyLimit).length * 15),
        todayAppointments: todayAppointments.map((item) => ({
          id: item.id,
          time: item.startTime,
          endTime: item.endTime,
          status: item.status,
          paymentStatus: item.paymentStatus,
          client: item.client.name,
          phone: item.client.phone,
          vehicle: item.client.vehicleModel ?? item.client.vehiclePlate,
          service: item.service.name,
          value: Number(item.finalPrice ?? item.service.price),
          href: `/admin/agendamentos?date=${item.date.toISOString().slice(0, 10)}`,
        })),
        conversations: conversations.map((item) => ({
          id: item.id,
          client: item.client?.name ?? "Novo contato",
          phone: item.phone,
          preview: item.lastMessagePreview,
          unreadCount: item.unreadCount,
          handoffStatus: item.handoffStatus,
          waitingSince: item.lastMessageAt,
          href: `/admin/atendimento?phone=${encodeURIComponent(item.phone)}`,
        })),
        queue: {
          pending: queue.filter((item) => !item.isDailyLimit).length,
          retrying: queue.filter((item) => !item.isDailyLimit && item.attempts > 0).length,
          dailyLimit: queue.filter((item) => item.isDailyLimit).length,
        },
        pendingPayments: pendingPayments.length,
        pendingConfirmations: pendingConfirmations.length,
        expectedToday: todayAppointments.reduce((sum, item) => sum + Number(item.finalPrice ?? item.service.price), 0),
        settings,
      },
      insights: {
        revenue,
        revenueChange: percentChange(revenue, previousRevenue),
        expenses,
        profit: revenue - expenses,
        bookings: currentAppointments.length,
        bookingsChange: percentChange(currentAppointments.length, previousAppointments.length),
        averageTicket: currentAppointments.length ? totalFinalValue / currentAppointments.length : 0,
        completionRate: currentAppointments.length ? Math.round((completed.length / currentAppointments.length) * 100) : 0,
        whatsappShare: currentAppointments.length ? Math.round((currentAppointments.filter((item) => item.source.toLowerCase().includes("whatsapp")).length / currentAppointments.length) * 100) : 0,
        uniqueClients: new Set(currentAppointments.map((item) => item.clientId)).size,
        funnel: {
          created: currentAppointments.length,
          active: active.length,
          completed: completed.length,
          cancelled: currentAppointments.filter((item) => item.status === "CANCELLED").length,
          noShow: currentAppointments.filter((item) => item.status === "NO_SHOW").length,
        },
        services: Array.from(serviceMap.values()).sort((a, b) => b.value - a.value).slice(0, 8),
        sources: Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      },
      retention: {
        counts: {
          active: retention.filter((item) => item.segment === "active").length,
          days30: retention.filter((item) => item.segment === "30-59").length,
          days60: retention.filter((item) => item.segment === "60-89").length,
          days90: retention.filter((item) => item.segment === "90+").length,
          never: retention.filter((item) => item.segment === "never").length,
        },
        opportunities: retention.filter((item) => item.segment !== "active").sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999)).slice(0, 120),
      },
      generatedAt: now,
    },
  });
}
