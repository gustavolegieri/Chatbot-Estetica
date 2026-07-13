import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: {
        pixKey: true,
        pixHolderName: true,
        pixBank: true,
        pixMerchantCity: true,
        pixQrCodeImage: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        pixKey: settings?.pixKey ?? null,
        pixHolderName: settings?.pixHolderName ?? null,
        pixBank: settings?.pixBank ?? null,
        pixMerchantCity: settings?.pixMerchantCity ?? "Jundiai",
        pixQrCodeImage: settings?.pixQrCodeImage ?? null,
        // Futuras formas de pagamento (placeholders)
        creditCardEnabled: false,
        mercadoPagoToken: null,
        stripePublicKey: null,
        stripeSecretKey: null,
      },
    });
  } catch (error) {
    console.error("[Pagamentos] Error fetching settings:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar configurações" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pixKey,
      pixHolderName,
      pixBank,
      pixMerchantCity,
      pixQrCodeImage,
      // Futuras formas de pagamento (serão ignoradas por enquanto)
      creditCardEnabled,
      mercadoPagoToken,
      stripePublicKey,
      stripeSecretKey,
    } = body;

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: {
        pixKey: pixKey ?? null,
        pixHolderName: pixHolderName ?? null,
        pixBank: pixBank ?? null,
        pixMerchantCity: pixMerchantCity ?? "Jundiai",
        pixQrCodeImage: pixQrCodeImage ?? null,
      },
      create: {
        id: "default",
        pixKey: pixKey ?? null,
        pixHolderName: pixHolderName ?? null,
        pixBank: pixBank ?? null,
        pixMerchantCity: pixMerchantCity ?? "Jundiai",
        pixQrCodeImage: pixQrCodeImage ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        pixKey: settings.pixKey,
        pixHolderName: settings.pixHolderName,
        pixBank: settings.pixBank,
        pixMerchantCity: settings.pixMerchantCity,
        pixQrCodeImage: settings.pixQrCodeImage,
        creditCardEnabled: false,
        mercadoPagoToken: null,
        stripePublicKey: null,
        stripeSecretKey: null,
      },
    });
  } catch (error) {
    console.error("[Pagamentos] Error saving settings:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar configurações" },
      { status: 500 }
    );
  }
}
