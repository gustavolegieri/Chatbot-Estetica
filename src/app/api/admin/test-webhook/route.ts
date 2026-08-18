import { NextRequest, NextResponse } from "next/server";
import { processWhatsAppMessage } from "@/lib/whatsapp-bot";
import { prisma } from "@/lib/prisma";

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
 *   pushName?: "Teste",
 *   messageId?: "TESTE-DEDUP-001" // opcional - para testar deduplicação
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, text, buttonId, listId, pushName, messageId, sourceType } = body;

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
      pushName,
      messageId,
      sourceType,
    });

    // Se messageId foi fornecido, verifica a deduplicação do webhook real.
    // A gravação é feita uma única vez por processWhatsAppMessage abaixo.
    if (messageId) {
      // Verificar se já foi processado (similar ao isMessageProcessed do webhook)
      const existing = await prisma.whatsAppMessage.findUnique({
        where: { wasenderMessageId: messageId }
      });
      
      if (existing) {
        console.log("[Test Webhook] Mensagem já processada (dedup):", messageId);
        return NextResponse.json({
          success: true,
          message: "Mensagem ignorada (já processada)",
          dedup: true
        });
      }
    }

    // Processar a mensagem como se fosse recebida pelo webhook
    await processWhatsAppMessage({
      phone,
      text,
      buttonId,
      listId,
      pushName,
      messageId,
      sourceType: sourceType === "audio" ? "audio" : "text",
    });

    return NextResponse.json({
      success: true,
      message: "Mensagem processada com sucesso",
      data: { phone, text, buttonId, listId, pushName, messageId, sourceType: sourceType === "audio" ? "audio" : "text" }
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
        pushName: "string (opcional) - nome do remetente",
        messageId: "string (opcional) - ID da mensagem para testar deduplicação",
        sourceType: '"text" ou "audio" (opcional) - simula a origem da mensagem'
      },
      example: {
        phone: "5511972851072",
        text: "Oi",
        pushName: "Teste",
        messageId: "TESTE-DEDUP-001"
      }
    }
  });
}
