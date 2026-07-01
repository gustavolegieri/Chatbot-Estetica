import { NextRequest, NextResponse } from "next/server";
import { startOfDay, endOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { from, to, type } = body;
    const fromDate = from ? startOfDay(new Date(from)) : new Date(0);
    const toDate = to ? endOfDay(new Date(to)) : new Date();

    if (type === "clientes") {
      const clients = await prisma.client.findMany({
        where: { createdAt: { gte: fromDate, lte: toDate } },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, data: { items: clients, summary: { count: clients.length } } });
    }

    if (type === "agendamentos") {
      const appts = await prisma.appointment.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        include: { client: true, service: true },
        orderBy: { date: "desc" },
      });
      return NextResponse.json({ success: true, data: { items: appts, summary: { count: appts.length } } });
    }

    if (type === "financeiro") {
      const records = await prisma.financialRecord.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        orderBy: { date: "desc" },
      });
      const totalIncome = records.filter((record) => record.type === "INCOME").reduce((acc, record) => acc + Number(record.amount), 0);
      const totalExpense = records.filter((record) => record.type === "EXPENSE").reduce((acc, record) => acc + Number(record.amount), 0);
      return NextResponse.json({ success: true, data: { items: records, summary: { count: records.length, totalIncome, totalExpense, balance: totalIncome - totalExpense } } });
    }

    if (type === "summary") {
      const now = new Date();
      const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const [thisRevenueAgg, lastRevenueAgg, thisAppointments, lastAppointments] = await Promise.all([
        prisma.financialRecord.aggregate({ where: { type: "INCOME", date: { gte: startOfDay(startThisMonth), lte: endOfDay(now) } }, _sum: { amount: true } }),
        prisma.financialRecord.aggregate({ where: { type: "INCOME", date: { gte: startOfDay(startLastMonth), lte: endOfDay(endLastMonth) } }, _sum: { amount: true } }),
        prisma.appointment.count({ where: { createdAt: { gte: startOfDay(startThisMonth), lte: endOfDay(now) } } }),
        prisma.appointment.count({ where: { createdAt: { gte: startOfDay(startLastMonth), lte: endOfDay(endLastMonth) } } }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          items: [],
          summary: {
            thisMonthRevenue: Number(thisRevenueAgg._sum.amount ?? 0),
            lastMonthRevenue: Number(lastRevenueAgg._sum.amount ?? 0),
            thisMonthAppointments: thisAppointments,
            lastMonthAppointments: lastAppointments,
          },
        },
      });
    }

    return NextResponse.json({ success: false, error: "Tipo inválido" }, { status: 400 });
  } catch (error) {
    console.error("[relatorios POST]", error);
    return NextResponse.json({ success: false, error: "Erro ao gerar relatório." }, { status: 500 });
  }
}
