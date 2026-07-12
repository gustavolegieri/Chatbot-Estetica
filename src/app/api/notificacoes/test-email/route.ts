import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { notifyNewAppointment } from "@/lib/notifications";
import { sendText } from "@/lib/evolution-api";

// Endpoint simples para testar envio de e-mail.
// Como o envio de e-mail depende do nodemailer/SMTP, aqui fazemos apenas um "smoke test"
// chamando a função de notificação que já tenta o envio (ou no-op se não estiver configurado).

const schema = z.object({ to: z.string().email().optional() });

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }

  try {
    // Evita erro "Unexpected end of JSON input" quando body vier vazio/inválido
    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      const txt = await request.text().catch(() => "");
      if (txt && txt.trim()) {
        try {
          raw = JSON.parse(txt);
        } catch {
          raw = {};
        }
      }
    }

    const body = schema.parse(raw);

    const settings = await prisma.notificationSetting.findUnique({ where: { id: "default" } });
    const notifyEmailAddress = body.to ?? settings?.notifyEmailAddress ?? null;

    if (!notifyEmailAddress) {
      return NextResponse.json({ success: false, error: "Informe um e-mail no painel (ou envie via body.to)." }, { status: 400 });
    }

    // Mensagem WhatsApp para confirmar que o botão funcionou
    // (não substitui o e-mail, mas ajuda a validar o fluxo)
    await sendText({
      number: (process.env.BOT_TEST_PHONE ?? settings?.notifyEmailAddress ?? ""),
      text: "Teste de e-mail solicitado no painel admin.",
      sender: "ADMIN",
      flowStage: "TEST_EMAIL",
    }).catch(() => {});

    // Como não temos um modelo de “mensagem” para e-mail puro,
    // fazemos um teste chamando o helper de notificações com dados mínimos.
    // OBS: notifyNewAppointment vai enviar via WhatsApp também; se quiser evitar WhatsApp,
    // me avise que ajusto para um helper dedicado.
    await notifyNewAppointment({
      id: "test-appointment",
      clientId: "test",
      serviceId: "test",
      date: new Date(),
      startTime: "12:00",
      endTime: "13:00",
      status: "CONFIRMED" as any,
      notes: null,
      source: "admin" as any,
      reminderSentAt: null,
      reminder4hSentAt: null,
      confirmWarningSentAt: null,
      clientConfirmedAt: null,
      needsPickup: false,
      needsReturn: false,
      pickupAddress: null,
      pickupDistanceKm: null,
      pickupFee: null,
      couponId: null,
      couponDiscount: null,
      finalPrice: null,
      paymentStatus: "PAID" as any,
      paymentGateway: "CASH" as any,
      paymentMethod: "DINHEIRO",
      transactionId: null,
      paidAt: new Date(),
      paymentSimulationCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      client: {
        id: "test",
        name: "Teste",
        phone: process.env.BOT_TEST_PHONE ? String(process.env.BOT_TEST_PHONE) : "5511000000000",
        email: notifyEmailAddress,
        vehiclePlate: null,
        vehicleModel: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      service: {
        id: "test",
        name: "Teste",
        description: null,
        price: 0 as any,
        durationMin: 60,
        active: true,
        catalogKey: null,
        categoryNum: null,
        menuOrder: 0,
        whatsappPitch: null,
        whatsappShort: null,
        whatsappDetail: null,
        priceHatchMin: null,
        priceHatchMax: null,
        priceSuvMin: null,
        priceSuvMax: null,
        timeEstimate: null,
        upsellServiceId: null,
        upsellBenefit: null,
        showInWhatsApp: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    });

    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "Erro ao testar e-mail" }, { status: 500 });
  }
}

