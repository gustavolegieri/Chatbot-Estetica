import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format, parse } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateEndTime, isSlotAvailable } from "@/lib/appointments";
import { onAppointmentStatusChange } from "@/lib/appointment-lifecycle";

const updateSchema = z.object({
  clientId: z.string().optional(),
  serviceId: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  notes: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const data = updateSchema.parse(body);

    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true, client: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Não encontrado" }, { status: 404 });
    }

    const previousStatus = existing.status;
    const serviceId = data.serviceId ?? existing.serviceId;
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return NextResponse.json({ success: false, error: "Serviço não encontrado" }, { status: 404 });
    }

    const dateStr = data.date ?? format(existing.date, "yyyy-MM-dd");
    const startTime = data.startTime ?? existing.startTime;

    const newStatus = data.status ?? previousStatus;
    if (
      (data.date || data.startTime || data.serviceId) &&
      newStatus !== "CANCELLED"
    ) {
      const available = await isSlotAvailable(dateStr, startTime, service.durationMin, id);
      if (!available) {
        return NextResponse.json(
          {
            success: false,
            error: `Horário ${startTime} indisponível. "${service.name}" ocupa ${service.durationMin} min — o próximo horário livre depende da duração do serviço.`,
          },
          { status: 409 }
        );
      }
    }

    let endTime = existing.endTime;
    if (data.startTime || data.serviceId) {
      endTime = calculateEndTime(startTime, service.durationMin);
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...data,
        date: data.date ? parse(data.date, "yyyy-MM-dd", new Date()) : undefined,
        endTime,
      },
      include: { client: true, service: true },
    });

    if (data.status === "COMPLETED") {
      const income = await prisma.financialRecord.findFirst({
        where: { appointmentId: id, type: "INCOME" },
      });
      if (!income) {
        await prisma.financialRecord.create({
          data: {
            type: "INCOME",
            category: "SERVICE",
            amount: appointment.service.price,
            description: `Serviço concluído - ${appointment.service.name}`,
            appointmentId: id,
            serviceId: appointment.serviceId,
            userId: session.userId,
          },
        });
      }
    }

    if (data.status) {
      await onAppointmentStatusChange(previousStatus, appointment);
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (e) {
    console.error("[agendamentos PUT]", e);
    return NextResponse.json({ success: false, error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.appointment.findUnique({
    where: { id },
    include: { client: true, service: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Não encontrado" }, { status: 404 });
  }

  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: { client: true, service: true },
  });

  await onAppointmentStatusChange(existing.status, appointment);

  return NextResponse.json({ success: true });
}
