import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  notifyNewAppointment: z.boolean().optional(),
  notifyClientHandoff: z.boolean().optional(),
  notifyCancelledAppointment: z.boolean().optional(),
  notifyMonthlyGoal: z.boolean().optional(),
  monthlyGoalAmount: z.union([z.number(), z.string(), z.null()]).optional(),
  notifyByEmail: z.boolean().optional(),
  notifyEmailAddress: z.union([z.string().email(), z.string().max(255), z.null()]).optional(),
});

export async function GET() {
  const settings = await prisma.notificationSetting.findUnique({ where: { id: "default" } });
  return NextResponse.json({ success: true, data: settings ?? null });
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = schema.parse(body);

    const monthlyGoalAmount = data.monthlyGoalAmount == null || data.monthlyGoalAmount === ""
      ? null
      : Number(data.monthlyGoalAmount);

    const notifyEmailAddress = data.notifyByEmail ? (data.notifyEmailAddress?.trim() || null) : null;

    const upsert = await prisma.notificationSetting.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        notifyNewAppointment: data.notifyNewAppointment ?? true,
        notifyClientHandoff: data.notifyClientHandoff ?? true,
        notifyCancelledAppointment: data.notifyCancelledAppointment ?? true,
        notifyMonthlyGoal: data.notifyMonthlyGoal ?? false,
        monthlyGoalAmount: monthlyGoalAmount ? monthlyGoalAmount : null,
        notifyByEmail: data.notifyByEmail ?? false,
        notifyEmailAddress,
      },
      update: {
        notifyNewAppointment: data.notifyNewAppointment ?? undefined,
        notifyClientHandoff: data.notifyClientHandoff ?? undefined,
        notifyCancelledAppointment: data.notifyCancelledAppointment ?? undefined,
        notifyMonthlyGoal: data.notifyMonthlyGoal ?? undefined,
        monthlyGoalAmount: monthlyGoalAmount ? monthlyGoalAmount : null,
        notifyByEmail: data.notifyByEmail ?? undefined,
        notifyEmailAddress,
      },
    });

    return NextResponse.json({ success: true, data: upsert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos." }, { status: 400 });
    }
    console.error("[notificacoes PUT]", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar notificações." }, { status: 500 });
  }
}
