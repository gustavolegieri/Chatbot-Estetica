import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Buscar métricas do painel teste
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Filter by date range if provided
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    // 1. Ticket médio
    const appointments = await prisma.appointment.findMany({
      where: {
        status: { in: ["COMPLETED", "CONFIRMED"] },
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        finalPrice: { not: null },
      },
      select: { finalPrice: true },
    });

    const totalRevenue = appointments.reduce((sum, apt) => sum + Number(apt.finalPrice || 0), 0);
    const averageTicket = appointments.length > 0 ? totalRevenue / appointments.length : 0;

    // 2. Top serviços
    const servicesCount = await prisma.appointment.groupBy({
      by: ['serviceId'],
      where: {
        status: { in: ["COMPLETED", "CONFIRMED"] },
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 5,
    });

    const serviceIds = servicesCount.map(s => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, price: true },
    });

    const topServices = servicesCount.map(sc => {
      const service = services.find(s => s.id === sc.serviceId);
      return {
        serviceName: service?.name || "N/A",
        count: sc._count.serviceId,
        price: service?.price || 0,
      };
    });

    // 3. Faturamento total
    const totalRevenueCompleted = await prisma.appointment.aggregate({
      where: {
        status: "COMPLETED",
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        finalPrice: { not: null },
      },
      _sum: { finalPrice: true },
    });

    // 4. Total de agendamentos
    const totalAppointments = await prisma.appointment.count({
      where: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
    });

    // 5. Clientes únicos
    const uniqueClients = await prisma.appointment.groupBy({
      by: ['clientId'],
      where: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
    });

    return NextResponse.json({
      averageTicket: {
        value: averageTicket,
        formatted: `R$ ${averageTicket.toFixed(2).replace('.', ',')}`,
      },
      totalRevenue: {
        value: Number(totalRevenueCompleted._sum.finalPrice || 0),
        formatted: `R$ ${(Number(totalRevenueCompleted._sum.finalPrice || 0)).toFixed(2).replace('.', ',')}`,
      },
      totalAppointments,
      uniqueClients: uniqueClients.length,
      topServices,
    });
  } catch (error) {
    console.error("[painel-teste-metricas] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar métricas" }, { status: 500 });
  }
}
