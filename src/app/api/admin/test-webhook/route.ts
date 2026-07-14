import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";

/**
 * API para simular mensagens recebidas do WhatsApp
 * Útil para testar o bot usando o próprio número como bot
 * 
 * POST /api/admin/test-webhook
 * Body: {
 *   phone: "5511972851072",
 *   text: "Oi",
 *   buttonId?: "1",
 *   listId?: "service_1",
 *   pushName?: "Teste"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, text, buttonId, listId, pushName } = body;

    if (!phone || !text) {
      return NextResponse.json(
        { success: false, error: "phone e text são obrigatórios" },
        { status: 400 }
      );
    }

    console.log("[Test Webhook] 🧪 Simulando mensagem recebida:", {
      phone,
      text,
      buttonId,
      listId,
      pushName
    });

    // Processar a mensagem como se fosse recebida pelo webhook
    await processWhatsAppMessage({
      phone,
      text,
      buttonId,
      listId,
      pushName,
    });

    return NextResponse.json({
      success: true,
      message: "Mensagem processada com sucesso",
      data: { phone, text, buttonId, listId, pushName }
    });
  } catch (error) {
    console.error("[Test Webhook] ❌ Erro ao processar mensagem:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar mensagem: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET para documentação rápida
export async function GET() {
  return NextResponse.json({
    message: "API para testar webhook do WhatsApp",
    usage: {
      method: "POST",
      body: {
        phone: "string (obrigatório) - número de telefone com DDD e DDI",
        text: "string (obrigatório) - mensagem de texto",
        buttonId: "string (opcional) - ID do botão clicado",
        listId: "string (opcional) - ID da lista selecionada",
        pushName: "string (opcional) - nome do remetente"
      },
      example: {
        phone: "5511972851072",
        text: "Oi",
        pushName: "Teste"
      }
    }
  });
}