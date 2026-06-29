import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateEndTime, isSlotAvailable } from "@/lib/appointments";
import { localDayRange, parseIsoDateLocal } from "@/lib/date-br";

const createSchema = z.object({
  clientId: z.string(),
  serviceId: z.string(),
  date: z.string(),
  startTime: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");
  const date = request.nextUrl.searchParams.get("date");

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(date
        ? (() => {
            const range = localDayRange(date);
            return { date: { gte: range.gte, lt: range.lt } };
          })()
        : {}),
    },
    include: { client: true, service: true },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({ success: true, data: appointments });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service) {
      return NextResponse.json({ success: false, error: "Serviço não encontrado" }, { status: 404 });
    }

    const available = await isSlotAvailable(data.date, data.startTime, service.durationMin);
    if (!available) {
      return NextResponse.json(
        {
          success: false,
          error: `Horário ${data.startTime} indisponível para "${service.name}" (${service.durationMin} min). Escolha outro horário.`,
        },
        { status: 409 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientId: data.clientId,
        serviceId: data.serviceId,
        date: parseIsoDateLocal(data.date),
        startTime: data.startTime,
        endTime: calculateEndTime(data.startTime, service.durationMin),
        status: data.status ?? "CONFIRMED",
        notes: data.notes,
        source: "admin",
        clientConfirmedAt: new Date(),
      },
      include: { client: true, service: true },
    });

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao criar agendamento" }, { status: 500 });
  }
}
