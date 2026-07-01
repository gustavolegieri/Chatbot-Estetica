import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  // export backup
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

    return NextResponse.json({ success: true, data: payload });
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

    // careful restore: wipe and recreate in safe order
    // delete dependent records first
    await prisma.$transaction([
      prisma.appointment.deleteMany(),
      prisma.financialRecord.deleteMany(),
      prisma.whatsAppMessage.deleteMany(),
      prisma.whatsAppSession.deleteMany(),
      prisma.client.deleteMany(),
      prisma.service.deleteMany(),
      prisma.botPrompt.deleteMany(),
      prisma.user.deleteMany(),
      prisma.coupon.deleteMany(),
    ]);

    // recreate
    if (Array.isArray(data.clients) && data.clients.length) {
      await prisma.client.createMany({ data: data.clients });
    }
    if (Array.isArray(data.services) && data.services.length) {
      await prisma.service.createMany({ data: data.services });
    }
    if (Array.isArray(data.users) && data.users.length) {
      await prisma.user.createMany({ data: data.users });
    }
    if (Array.isArray(data.botPrompts) && data.botPrompts.length) {
      // BotPrompt uses key as id
      for (const p of data.botPrompts) {
        await prisma.botPrompt.create({ data: p });
      }
    }
    if (Array.isArray(data.appointments) && data.appointments.length) {
      await prisma.appointment.createMany({ data: data.appointments });
    }
    if (Array.isArray(data.coupons) && data.coupons.length) {
      await prisma.coupon.createMany({ data: data.coupons });
    }

    if (data.settings) {
      await prisma.settings.upsert({ where: { id: "default" }, create: { id: "default", ...data.settings }, update: data.settings });
    }

    if (data.brand) {
      await prisma.brand.upsert({ where: { id: "default" }, create: { id: "default", ...data.brand }, update: data.brand });
    }

    if (data.notificationSetting) {
      await prisma.notificationSetting.upsert({ where: { id: "default" }, create: { id: "default", ...data.notificationSetting }, update: data.notificationSetting });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[backup POST]", error);
    return NextResponse.json({ success: false, error: "Erro ao restaurar backup." }, { status: 500 });
  }
}
