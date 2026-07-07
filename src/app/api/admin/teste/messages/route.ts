import { NextRequest, NextResponse } from "next/server";
import { testSessions } from "@/lib/test-sessions-store";
import { processTestFlow } from "@/lib/test-bot-processor";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json();

    if (!sessionId || !message) {
      return NextResponse.json(
        { success: false, error: "sessionId e message são obrigatórios" },
        { status: 400 }
      );
    }

    // Obter sessão de teste
    let session = testSessions.get(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Sessão não encontrada. Reinicie o teste." },
        { status: 404 }
      );
    }

    // Chamar processador de fluxo
    const responses = await processTestFlow({
      sessionId,
      message: message.trim(),
      session,
    });

    // Atualizar sessão no mapa
    testSessions.set(sessionId, session);

    return NextResponse.json({
      success: true,
      responses,
    });
  } catch (error) {
    console.error("[Teste Bot] Erro ao processar mensagem:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao processar mensagem" },
      { status: 500 }
    );
  }
}
