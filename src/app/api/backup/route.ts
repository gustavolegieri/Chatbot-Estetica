import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    const [clients, appointments, services, botPrompts, settings, brand, notificationSetting, users, coupons] = await Promise.all([
      prisma.client.findMany(),
      prisma.appointment.findMany(),
      prisma.service.findMany(),
      prisma.botPrompt.findMany(),
      prisma.settings.findUnique({ where: { id: "default" } }),
      prisma.brand.findUnique({ where: { id: "default" } }),
      prisma.notificationSetting.findUnique({ where: { id: "default" } }),
      prisma.user.findMany(),
      prisma.coupon.findMany(),
    ]);

    const payload = {
      clients,
      appointments,
      services,
      botPrompts,
      settings,
      brand,
      notificationSetting,
      users,
      coupons,
      exportedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: payload,
      meta: {
        counts: {
          clients: clients.length,
          appointments: appointments.length,
          services: services.length,
          botPrompts: botPrompts.length,
          users: users.length,
          coupons: coupons.length,
        },
      },
    });
  } catch (error) {
    console.error("[backup GET]", error);
    return NextResponse.json({ success: false, error: "Erro ao gerar backup." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { confirm, data } = body;
    if (!confirm) {
      return NextResponse.json({ success: false, error: "Confirmação necessária para restaurar." }, { status: 400 });
    }

    if (!data) return NextResponse.json({ success: false, error: "Dados de backup ausentes." }, { status: 400 });

    const counts = {
      clients: Array.isArray(data.clients) ? data.clients.length : 0,
      appointments: Array.isArray(data.appointments) ? data.appointments.length : 0,
      services: Array.isArray(data.services) ? data.services.length : 0,
      botPrompts: Array.isArray(data.botPrompts) ? data.botPrompts.length : 0,
      users: Array.isArray(data.users) ? data.users.length : 0,
      coupons: Array.isArray(data.coupons) ? data.coupons.length : 0,
    };

    await prisma.$transaction(async (tx) => {
      await tx.appointment.deleteMany();
      await tx.financialRecord.deleteMany();
      await tx.whatsAppMessage.deleteMany();
      await tx.whatsAppSession.deleteMany();
      await tx.client.deleteMany();
      await tx.service.deleteMany();
      await tx.botPrompt.deleteMany();
      await tx.user.deleteMany();
      await tx.coupon.deleteMany();

      if (Array.isArray(data.clients) && data.clients.length) {
        await tx.client.createMany({ data: data.clients });
      }
      if (Array.isArray(data.services) && data.services.length) {
        await tx.service.createMany({ data: data.services });
      }
      if (Array.isArray(data.users) && data.users.length) {
        await tx.user.createMany({ data: data.users });
      }
      if (Array.isArray(data.botPrompts) && data.botPrompts.length) {
        for (const p of data.botPrompts) {
          await tx.botPrompt.create({ data: p });
        }
      }
      if (Array.isArray(data.appointments) && data.appointments.length) {
        await tx.appointment.createMany({ data: data.appointments });
      }
      if (Array.isArray(data.coupons) && data.coupons.length) {
        await tx.coupon.createMany({ data: data.coupons });
      }

      if (data.settings) {
        await tx.settings.upsert({ where: { id: "default" }, create: { id: "default", ...data.settings }, update: data.settings });
      }
      if (data.brand) {
        await tx.brand.upsert({ where: { id: "default" }, create: { id: "default", ...data.brand }, update: data.brand });
      }
      if (data.notificationSetting) {
        await tx.notificationSetting.upsert({ where: { id: "default" }, create: { id: "default", ...data.notificationSetting }, update: data.notificationSetting });
      }
    });

    return NextResponse.json({ success: true, data: { restored: counts } });
  } catch (error) {
    console.error("[backup POST]", error);
    return NextResponse.json({ success: false, error: "Erro ao restaurar backup." }, { status: 500 });
  }
}
