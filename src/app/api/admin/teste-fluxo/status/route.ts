import { NextRequest, NextResponse } from 'next/server';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'sessionId é obrigatório' }, { status: 400 });
    }

    const session = testFluxoStorage.get(sessionId);

    if (!session) {
      return NextResponse.json({ 
        success: false, 
        error: 'Sessão não encontrada' 
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      sessionId,
      currentStep: session.currentStep,
      currentStepName: session.currentStepName,
      completed: session.completed,
      phone: session.phone,
      startedAt: session.startedAt
    });
  } catch (error) {
    console.error('[Teste Fluxo Status] Erro:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
