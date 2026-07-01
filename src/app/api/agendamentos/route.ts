import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateEndTime, isSlotAvailable } from "@/lib/appointments";
import { localDayRange, parseIsoDateLocal } from "@/lib/date-br";
import { findCouponByCode } from '@/lib/coupons';
import { logAudit } from '@/lib/audit';

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
    // optional coupon code
    const couponCode: string | undefined = (body as any).couponCode;

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

    // if coupon provided, attempt to create redemption record linking to this appointment
    if (couponCode) {
      try {
        const coupon = await findCouponByCode(couponCode);
        if (coupon) {
          // compute applied amount for percent type
          let appliedAmount: number | null = null;
          if (coupon.type === 'percent') {
            appliedAmount = Number((Number(service.price) * Number(coupon.amount) / 100).toFixed(2));
          } else {
            appliedAmount = Number(coupon.amount);
          }
          await prisma.couponRedemption.create({ data: { couponId: coupon.id, clientId: data.clientId, appointmentId: appointment.id, amountApplied: appliedAmount } });
          // create financial record to reflect discount (negative income)
          if (appliedAmount) {
            await prisma.financialRecord.create({ data: { type: 'EXPENSE', category: 'OTHER', amount: appliedAmount, description: `Desconto via cupom ${coupon.code}`, date: new Date(), appointmentId: appointment.id, serviceId: service.id } });
          }
          await logAudit({ action: 'redeem_coupon_via_appointment', resource: coupon.id, data: { appointmentId: appointment.id, clientId: data.clientId, appliedAmount } });
        }
      } catch (e) {
        // do not block appointment creation if coupon redeem fails here; log error
        console.warn('coupon redemption failed during appointment creation', e);
      }
    }

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao criar agendamento" }, { status: 500 });
  }
}
