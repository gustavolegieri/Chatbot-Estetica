import { NextRequest, NextResponse } from "next/server";
import { FlowState } from "@/lib/whatsapp-flow-types";
import { processNumberedFlow, startFlow } from "@/lib/whatsapp-flow";
import { v4 as uuidv4 } from "uuid";

/**
 * API para o Test Bot - simula conversa completa com o bot
 * 
 * POST /api/admin/test-bot
 * Body: {
 *   text: string,
 *   sessionId?: string,
 *   useRealAI?: boolean,
 *   reset?: boolean
 * }
 */

interface TestBotMessage {
  text: string;
  sender: "user" | "bot";
  timestamp: string;
}

interface TestBotSession {
  id: string;
  phone: string;
  messages: TestBotMessage[];
  flowState: FlowState;
  createdAt: string;
  updatedAt: string;
}

// Em memória (para desenvolvimento - em produção usar Redis ou banco)
const testSessions = new Map<string, TestBotSession>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, sessionId, useRealAI = false, reset = false } = body;

    if (!text && !reset) {
      return NextResponse.json(
        { success: false, error: "text é obrigatório" },
        { status: 400 }
      );
    }

    let session: TestBotSession;

    // Reset de sessão
    if (reset) {
      if (sessionId && testSessions.has(sessionId)) {
        testSessions.delete(sessionId);
      }
      const newSessionId = uuidv4();
      const newPhone = `test-${newSessionId}`;
      
      session = {
        id: newSessionId,
        phone: newPhone,
        messages: [],
        flowState: { stage: "ETAPA1_AWAITING_NAME" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      testSessions.set(newSessionId, session);
      
      return NextResponse.json({
        success: true,
        sessionId: newSessionId,
        flowState: session.flowState,
        messages: session.messages,
        reset: true
      });
    }

    // Usar sessão existente ou criar nova
    if (sessionId && testSessions.has(sessionId)) {
      session = testSessions.get(sessionId)!;
    } else {
      const newSessionId = sessionId || uuidv4();
      const newPhone = `test-${newSessionId}`;
      
      session = {
        id: newSessionId,
        phone: newPhone,
        messages: [],
        flowState: { stage: "ETAPA1_AWAITING_NAME" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      testSessions.set(newSessionId, session);
    }

    // Adicionar mensagem do usuário
    session.messages.push({
      text,
      sender: "user",
      timestamp: new Date().toISOString()
    });

    // Capturar respostas do bot usando callback
    const botResponses: string[] = [];
    
    try {
      // Processar mensagem usando o motor real do bot com modo de teste
      const msg = {
        phone: session.phone,
        text,
        pushName: "Test User",
        testMode: {
          sendTextCallback: async (text: string) => {
            botResponses.push(text);
          },
          useRealAI
        }
      };

      if (!session.flowState.welcomed) {
        await startFlow(msg);
        session.flowState.welcomed = true;
      } else {
        await processNumberedFlow(msg, session.flowState);
      }

      // Atualizar estado do flow
      session.flowState = session.flowState;

    } catch (error) {
      console.error("[Test Bot] Erro ao processar mensagem:", error);
      botResponses.push("❌ Erro ao processar mensagem: " + (error as Error).message);
    }

    // Adicionar respostas do bot à sessão
    for (const response of botResponses) {
      session.messages.push({
        text: response,
        sender: "bot",
        timestamp: new Date().toISOString()
      });
    }

    session.updatedAt = new Date().toISOString();
    testSessions.set(session.id, session);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      flowState: session.flowState,
      messages: session.messages,
      botResponses
    });

  } catch (error) {
    console.error("[Test Bot] Erro na API:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET para buscar estado atual da sessão
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId é obrigatório" },
      { status: 400 }
    );
  }

  const session = testSessions.get(sessionId);

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Sessão não encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    sessionId: session.id,
    flowState: session.flowState,
    messages: session.messages
  });
}

// DELETE para limpar sessão
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: "sessionId é obrigatório" },
      { status: 400 }
    );
  }

  const deleted = testSessions.delete(sessionId);

  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Sessão não encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Sessão removida com sucesso"
  });
}