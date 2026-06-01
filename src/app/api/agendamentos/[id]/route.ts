import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parse } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateEndTime } from "@/lib/appointments";

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
      include: { service: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Não encontrado" }, { status: 404 });
    }

    let endTime = existing.endTime;
    if (data.startTime || data.serviceId) {
      const serviceId = data.serviceId ?? existing.serviceId;
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (service) {
        endTime = calculateEndTime(data.startTime ?? existing.startTime, service.durationMin);
      }
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
      const existing = await prisma.financialRecord.findFirst({
        where: { appointmentId: id, type: "INCOME" },
      });
      if (!existing) {
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

    return NextResponse.json({ success: true, data: appointment });
  } catch {
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
  await prisma.appointment.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ success: true });
}
