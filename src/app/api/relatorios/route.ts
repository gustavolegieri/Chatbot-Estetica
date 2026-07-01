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
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();

    if (type === "clientes") {
      const clients = await prisma.client.findMany({ where: { createdAt: { gte: startOfDay(fromDate), lte: endOfDay(toDate) } } });
      return NextResponse.json({ success: true, data: clients });
    }

    if (type === "agendamentos") {
      const appts = await prisma.appointment.findMany({ where: { date: { gte: startOfDay(fromDate), lte: endOfDay(toDate) } }, include: { client: true, service: true } });
      return NextResponse.json({ success: true, data: appts });
    }

    if (type === "financeiro") {
      const records = await prisma.financialRecord.findMany({ where: { date: { gte: startOfDay(fromDate), lte: endOfDay(toDate) } } });
      return NextResponse.json({ success: true, data: records });
    }

    if (type === "summary") {
      // month comparison
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
          thisMonthRevenue: Number(thisRevenueAgg._sum.amount ?? 0),
          lastMonthRevenue: Number(lastRevenueAgg._sum.amount ?? 0),
          thisMonthAppointments: thisAppointments,
          lastMonthAppointments: lastAppointments,
        },
      });
    }

    return NextResponse.json({ success: false, error: "Tipo inválido" }, { status: 400 });
  } catch (error) {
    console.error("[relatorios POST]", error);
    return NextResponse.json({ success: false, error: "Erro ao gerar relatório." }, { status: 500 });
  }
}
