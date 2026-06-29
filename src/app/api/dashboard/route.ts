import { NextResponse } from "next/server";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  }

  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalClients,
    totalAppointments,
    todayAppointments,
    pendingAppointments,
    monthIncome,
    monthExpenses,
    recentAppointments,
    revenueByService,
    whatsappSessions,
    whatsappAppointments,
    blockedDatesCount,
    activeServices,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.appointment.count(),
    prisma.appointment.count({
      where: {
        date: { gte: startOfDay(today), lte: endOfDay(today) },
        status: { notIn: ["CANCELLED"] },
      },
    }),
    prisma.appointment.count({ where: { status: "PENDING" } }),
    prisma.financialRecord.aggregate({
      where: { type: "INCOME", date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.financialRecord.aggregate({
      where: { type: "EXPENSE", date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.appointment.findMany({
      take: 5,
      orderBy: { date: "asc" },
      where: { date: { gte: today }, status: { notIn: ["CANCELLED"] } },
      include: { client: true, service: true },
    }),
    prisma.financialRecord.groupBy({
      by: ["serviceId"],
      where: { type: "INCOME", date: { gte: monthStart, lte: monthEnd }, serviceId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.whatsAppSession.count({ where: { updatedAt: { gte: weekAgo } } }),
    prisma.appointment.count({ where: { source: "whatsapp", createdAt: { gte: monthStart } } }),
    prisma.blockedDate.count({ where: { date: { gte: startOfDay(today) } } }),
    prisma.service.count({ where: { active: true, showInWhatsApp: true } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      totalClients,
      totalAppointments,
      todayAppointments,
      pendingAppointments,
      monthRevenue: Number(monthIncome._sum.amount ?? 0),
      monthExpenses: Number(monthExpenses._sum.amount ?? 0),
      recentAppointments,
      revenueByService,
      whatsappSessions,
      whatsappAppointments,
      blockedDatesCount,
      activeServices,
    },
  });
}
