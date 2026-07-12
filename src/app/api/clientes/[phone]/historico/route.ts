import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Buscar histórico de agendamentos de um cliente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params;
    
    // Buscar cliente pelo telefone
    const client = await prisma.client.findUnique({
      where: { phone },
    });

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // Buscar agendamentos anteriores
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId: client.id,
        status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] },
      },
      include: {
        service: {
          select: {
            name: true,
            catalogKey: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 10, // Últimos 10 agendamentos
    });

    // Calcular estatísticas
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(a => a.status === "COMPLETED").length;
    const favoriteService = getMostFrequentService(appointments);

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        vehicleModel: client.vehicleModel,
        vehiclePlate: client.vehiclePlate,
      },
      statistics: {
        totalAppointments,
        completedAppointments,
        noShowRate: totalAppointments > 0 
          ? ((appointments.filter(a => a.status === "NO_SHOW").length / totalAppointments) * 100).toFixed(1)
          : "0",
        favoriteService,
      },
      appointments: appointments.map(apt => ({
        id: apt.id,
        date: apt.date,
        startTime: apt.startTime,
        service: apt.service.name,
        catalogKey: apt.service.catalogKey,
        status: apt.status,
        finalPrice: apt.finalPrice,
      })),
    });
  } catch (error) {
    console.error("[cliente-historico] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar histórico" }, { status: 500 });
  }
}

function getMostFrequentService(appointments: any[]): string | null {
  if (appointments.length === 0) return null;
  
  const serviceCount: Record<string, number> = {};
  appointments.forEach(apt => {
    const serviceName = apt.service.name;
    serviceCount[serviceName] = (serviceCount[serviceName] || 0) + 1;
  });

  let maxCount = 0;
  let mostFrequent = null;
  
  for (const [service, count] of Object.entries(serviceCount)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = service;
    }
  }

  return mostFrequent;
}
