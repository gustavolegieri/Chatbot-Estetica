import { NextRequest, NextResponse } from "next/server";
import { sendText } from "@/lib/evolution-api";

/**
 * API para testar envio direto de mensagens via WasenderAPI
 * Útil para diagnosticar problemas de envio
 * 
 * POST /api/admin/testar-envio
 * Body: {
 *   phone: "5511944400696",
 *   message: "Teste de envio"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: "phone e message são obrigatórios" },
        { status: 400 }
      );
    }

    console.log("[Testar Envio] 🧪 Testando envio direto:", { phone, message });

    // Enviar mensagem diretamente
    const result = await sendText({
      number: phone,
      text: message,
      skipBotLog: true, // Não logar no banco durante teste
      sender: "ADMIN",
    });

    console.log("[Testar Envio] 📊 Resultado:", result);

    // Verificar se houve erro
    if (result && typeof result === 'object' && 'error' in result) {
      return NextResponse.json({
        success: false,
        message: "Erro ao enviar mensagem",
        details: result
      });
    }

    return NextResponse.json({
      success: true,
      message: "Mensagem enviada com sucesso",
      details: result
    });
  } catch (error) {
    console.error("[Testar Envio] ❌ Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar requisição: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET para documentação
export async function GET() {
  return NextResponse.json({
    message: "API para testar envio direto de mensagens",
    usage: {
      method: "POST",
      body: {
        phone: "string (obrigatório) - número de telefone com DDD e DDI",
        message: "string (obrigatório) - mensagem de texto"
      },
      example: {
        phone: "5511944400696",
        message: "Teste de envio"
      }
    }
  });
}