import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePixQrCode, type PixQrCodeData } from "@/lib/pix-qr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Valor inválido" },
        { status: 400 }
      );
    }

    // Buscar configurações PIX
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: {
        pixKey: true,
        pixHolderName: true,
        pixMerchantCity: true,
      },
    });

    if (!settings?.pixKey || !settings?.pixHolderName) {
      return NextResponse.json(
        { success: false, error: "Configure a chave PIX e nome do titular primeiro" },
        { status: 400 }
      );
    }

    // Gerar QR Code
    const qrData: PixQrCodeData = {
      amount: Number(amount),
      description: description || "Pagamento",
      merchantName: settings.pixHolderName,
      merchantCity: settings.pixMerchantCity || "Jundiai",
      key: settings.pixKey,
    };

    const qrCodeDataUrl = await generatePixQrCode(qrData);

    // Salvar no banco de dados
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        pixQrCodeImage: qrCodeDataUrl,
      },
    });

    return NextResponse.json({
      success: true,
      qrCodeDataUrl,
    });
  } catch (error) {
    console.error("[Pagamentos Generate QR] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao gerar QR Code" },
      { status: 500 }
    );
  }
}
