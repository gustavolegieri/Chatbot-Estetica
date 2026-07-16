import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";

/**
 * API para testar o lock distribuído
 * 
 * POST /api/admin/test-lock
 * Body: {
 *   phone: string,
 *   text: string,
 *   pushName?: string
 * }
 * 
 * Esta rota permite testar o lock distribuído usando o banco de dados real,
 * diferente do test-bot que usa skipDb=true.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, text, pushName } = body;

    if (!phone || !text) {
      return NextResponse.json(
        { success: false, error: "phone e text são obrigatórios" },
        { status: 400 }
      );
    }

    console.log("[Test Lock] Processando mensagem:", { phone, text });

    // Processa a mensagem usando o motor real do bot com banco de dados
    await processWhatsAppMessage({
      phone,
      text,
      pushName: pushName || "Test User",
    });

    return NextResponse.json({
      success: true,
      message: "Mensagem processada com sucesso"
    });

  } catch (error) {
    console.error("[Test Lock] Erro ao processar mensagem:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno: " + (error as Error).message },
      { status: 500 }
    );
  }
}
