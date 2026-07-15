import { NextRequest, NextResponse } from 'next/server';
import { sendText } from '@/lib/evolution-api';
import { sendMedia } from '@/lib/evolution-api';
import { generateCalendarImageOnly } from '@/lib/calendar-helper';
import { generateSummaryCard } from '@/lib/summary-card';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';

const STEPS = [
  { id: 'welcome', name: 'Boas-vindas', getText: () => '👋 Olá! Bem-vindo à Estética Automotiva!' },
  { id: 'menu', name: 'Menu Principal', getText: () => '📋 *MENU PRINCIPAL*\n\n1️⃣ Agendar serviço\n2️⃣ Meus agendamentos\n3️⃣ Cancelar agendamento\n4️⃣ Falar com atendente' },
  { id: 'service', name: 'Seleção de Serviço', getText: () => '🧽 *SERVIÇOS DISPONÍVEIS*\n\n1️⃣ Polimento Completo\n2️⃣ Lavagem Detalhada\n3️⃣ Higienização Interna\n4️⃣ Vitrofertilização' },
  { id: 'vehicle', name: 'Seleção de Veículo', getText: () => '🚗 *SELECIONE O VEÍCULO*\n\n1️⃣ Sedan\n2️⃣ SUV\n3️⃣ Hatch\n4️⃣ Picape' },
  { id: 'day', name: 'Seleção de Data', getText: () => '📅 *SELECIONE A DATA*\n\n1️⃣ Hoje\n2️⃣ Amanhã\n3️⃣ Próxima semana\n4️⃣ Outra data' },
  { id: 'time', name: 'Seleção de Horário', getText: () => '⏰ *SELECIONE O HORÁRIO*\n\n1️⃣ 08:00\n2️⃣ 10:00\n3️⃣ 14:00\n4️⃣ 16:00' },
  { id: 'logistics', name: 'Logística', getText: () => '🚚 *LOGÍSTICA*\n\n1️⃣ Leva e traz\n2️⃣ Busca no local\n3️⃣ Entrego no local' },
  { id: 'calendar', name: 'Calendário', type: 'calendar' },
  { id: 'summary', name: 'Resumo', type: 'summary' },
  { id: 'confirmation', name: 'Confirmação', getText: () => '✅ *AGENDAMENTO CONFIRMADO!*\n\nSeu agendamento foi realizado com sucesso. Você receberá um lembrete 24h antes.' },
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, step, mode } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: 'Número é obrigatório' }, { status: 400 });
    }

    if (mode === 'individual') {
      return await testIndividualStep(phone, step);
    } else if (mode === 'sequence') {
      return await startSequenceTest(phone);
    } else {
      return NextResponse.json({ success: false, error: 'Modo inválido' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Teste Fluxo] Erro:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

async function testIndividualStep(phone: string, stepId: string) {
  const step = STEPS.find(s => s.id === stepId);
  
  if (!step) {
    return NextResponse.json({ success: false, error: 'Etapa não encontrada' }, { status: 404 });
  }

  try {
    if (step.type === 'calendar') {
      // Testar envio de calendário
      const calendarResult = await generateCalendarImageOnly();
      return NextResponse.json({ 
        success: true, 
        message: `Calendário enviado para ${phone}`,
        type: 'calendar'
      });
    } else if (step.type === 'summary') {
      // Testar envio de resumo
      const summaryData = {
        customerName: "Cliente Teste",
        serviceName: "Polimento Completo",
        vehicle: "Toyota Corolla 2022",
        date: "15/07/2026",
        time: "14:30",
        paymentMethod: "PIX",
        totalPrice: 350.00,
        pickupAddress: "Rua Teste, 123"
      };
      
      const summaryUrl = await generateSummaryCard(summaryData);
      await sendMedia({
        number: phone,
        mediaUrl: summaryUrl,
        caption: '📋 Resumo do Agendamento (Teste)'
      });
      
      return NextResponse.json({ 
        success: true, 
        message: `Resumo enviado para ${phone}`,
        type: 'summary'
      });
    } else {
      // Testar envio de texto
      const text = step.getText ? step.getText() : `Teste de etapa: ${step.name}`;
      await sendText({
        number: phone,
        text
      });
      
      return NextResponse.json({ 
        success: true, 
        message: `Etapa "${step.name}" enviada para ${phone}` 
      });
    }
  } catch (error) {
    console.error(`[Teste Fluxo] Erro ao enviar etapa ${stepId}:`, error);
    return NextResponse.json({ 
      success: false, 
      error: `Erro ao enviar etapa: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
    }, { status: 500 });
  }
}

async function startSequenceTest(phone: string) {
  const sessionId = `test-${Date.now()}`;
  
  testFluxoStorage.set(sessionId, {
    startedAt: new Date(),
    currentStep: 0,
    completed: false,
    phone
  });

  // Iniciar sequência em background
  runSequence(sessionId, phone);

  return NextResponse.json({ 
    success: true, 
    sessionId,
    message: 'Sequência iniciada - verificar status com /api/admin/teste-fluxo/status'
  });
}

async function runSequence(sessionId: string, phone: string) {
  const session = testFluxoStorage.get(sessionId);
  if (!session) return;

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    
    try {
      if (step.type === 'calendar') {
        await generateCalendarImageOnly();
      } else if (step.type === 'summary') {
        const summaryData = {
          customerName: "Cliente Teste",
          serviceName: "Polimento Completo",
          vehicle: "Toyota Corolla 2022",
          date: "15/07/2026",
          time: "14:30",
          paymentMethod: "PIX",
          totalPrice: 350.00,
          pickupAddress: "Rua Teste, 123"
        };
        
        const summaryUrl = await generateSummaryCard(summaryData);
        await sendMedia({
          number: phone,
          mediaUrl: summaryUrl,
          caption: '📋 Resumo do Agendamento (Teste Sequência)'
        });
      } else {
        const text = step.getText ? step.getText() : `Teste de etapa: ${step.name}`;
        await sendText({
          number: phone,
          text
        });
      }

      // Atualizar sessão
      session.currentStep = i + 1;
      session.currentStepName = step.name;
      testFluxoStorage.set(sessionId, session);

      // Aguardar 1 minuto (rate limit) - exceto na última etapa
      if (i < STEPS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minuto
      }
    } catch (error) {
      console.error(`[Teste Fluxo] Erro na etapa ${step.id}:`, error);
    }
  }

  // Marcar como concluído
  session.completed = true;
  testFluxoStorage.set(sessionId, session);
}
