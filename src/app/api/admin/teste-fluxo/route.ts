import { NextRequest, NextResponse } from 'next/server';
import { sendText } from '@/lib/evolution-api';
import { sendMedia } from '@/lib/evolution-api';
import { generateCalendarImageOnly } from '@/lib/calendar-helper';
import { generateSummaryCard } from '@/lib/summary-card';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';
import { etapa1Welcome, etapa2MainMenu, etapa4Vehicle, etapa7Day, etapa7Time, etapa8Payment, etapa9Confirm, formatHours, type FlowContext } from '@/lib/whatsapp-flow-messages';
import { loadWhatsAppCatalog, buildMainMenu } from '@/lib/whatsapp-service-catalog';
import { prisma } from '@/lib/prisma';
import { BRAND_DEFAULT } from '@/lib/whatsapp-catalog';

const STEPS = [
  { id: 'welcome', name: 'Boas-vindas', type: 'welcome' },
  { id: 'menu', name: 'Menu Principal', type: 'menu' },
  { id: 'service', name: 'Seleção de Serviço', type: 'service' },
  { id: 'vehicle', name: 'Seleção de Veículo', type: 'vehicle' },
  { id: 'day', name: 'Seleção de Data', type: 'day' },
  { id: 'time', name: 'Seleção de Horário', type: 'time' },
  { id: 'logistics', name: 'Logística', type: 'logistics' },
  { id: 'calendar', name: 'Calendário', type: 'calendar' },
  { id: 'summary', name: 'Resumo', type: 'summary' },
  { id: 'confirmation', name: 'Confirmação', type: 'confirmation' },
];

async function loadContext(): Promise<FlowContext> {
  const s = await prisma.settings.findUnique({ where: { id: "default" } });
  return {
    businessName: s?.businessName ?? BRAND_DEFAULT,
    hours: formatHours(
      s?.businessHoursStart ?? "08:00",
      s?.businessHoursEnd ?? "18:00",
      s?.workingDays ?? "1,2,3,4,5,6"
    ),
    address: s?.businessAddress ?? "",
    pixKey: s?.pixKey ?? null,
    pixHolder: s?.pixHolderName ?? null,
    pixBank: s?.pixBank ?? null,
    pixMerchantCity: s?.pixMerchantCity ?? "Jundiai",
    pixQrCodeImage: s?.pixQrCodeImage ?? null,
  };
}

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
    const ctx = await loadContext();
    const wctx = await loadWhatsAppCatalog();

    let text = '';

    if (step.type === 'welcome') {
      // Exatamente como no startFlow do whatsapp-flow.ts
      text = etapa1Welcome(ctx, wctx.prompts);
    } else if (step.type === 'menu') {
      // Exatamente como no goToMainMenu do whatsapp-flow.ts
      const customerName = 'Cliente Teste';
      text = buildMainMenu(wctx.categories, wctx.prompts);
    } else if (step.type === 'service') {
      // Exatamente como o fluxo mostra os serviços
      text = buildMainMenu(wctx.categories, wctx.prompts);
    } else if (step.type === 'vehicle') {
      // Exatamente como no fluxo oficial
      text = etapa4Vehicle(false, wctx.prompts);
    } else if (step.type === 'day') {
      // Exatamente como no fluxo oficial
      text = etapa7Day(wctx.prompts);
    } else if (step.type === 'time') {
      // Exatamente como no fluxo oficial
      const slots = ['08:00', '10:00', '14:00', '16:00'];
      text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
    } else if (step.type === 'logistics') {
      // Exatamente como no fluxo oficial
      text = etapa8Payment(true, wctx.prompts);
    } else if (step.type === 'calendar') {
      // Testar envio de calendário
      const calendarResult = await generateCalendarImageOnly();
      await sendMedia({
        number: phone,
        mediaUrl: calendarResult,
        caption: '📅 Calendário de Disponibilidade (Teste)'
      });
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
    } else if (step.type === 'confirmation') {
      // Exatamente como no fluxo oficial
      text = etapa9Confirm(
        {
          name: 'Cliente Teste',
          vehicle: 'Toyota Corolla 2022',
          services: 'Polimento Completo',
          day: '15/07/2026',
          time: '14:30',
          payment: 'PIX',
          value: '350.00',
          address: 'Rua Teste, 123'
        },
        wctx.prompts
      );
    } else {
      text = `Teste de etapa: ${step.name}`;
    }

    await sendText({
      number: phone,
      text
    });
    
    return NextResponse.json({ 
      success: true, 
      message: `Etapa "${step.name}" enviada para ${phone}` 
    });
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

  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    
    try {
      let text = '';

      if (step.type === 'welcome') {
        // Exatamente como no startFlow do whatsapp-flow.ts
        text = etapa1Welcome(ctx, wctx.prompts);
      } else if (step.type === 'menu') {
        // Exatamente como no goToMainMenu do whatsapp-flow.ts
        text = buildMainMenu(wctx.categories, wctx.prompts);
      } else if (step.type === 'service') {
        // Exatamente como o fluxo mostra os serviços
        text = buildMainMenu(wctx.categories, wctx.prompts);
      } else if (step.type === 'vehicle') {
        // Exatamente como no fluxo oficial
        text = etapa4Vehicle(false, wctx.prompts);
      } else if (step.type === 'day') {
        // Exatamente como no fluxo oficial
        text = etapa7Day(wctx.prompts);
      } else if (step.type === 'time') {
        // Exatamente como no fluxo oficial
        const slots = ['08:00', '10:00', '14:00', '16:00'];
        text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
      } else if (step.type === 'logistics') {
        // Exatamente como no fluxo oficial
        text = etapa8Payment(true, wctx.prompts);
      } else if (step.type === 'calendar') {
        const calendarResult = await generateCalendarImageOnly();
        await sendMedia({
          number: phone,
          mediaUrl: calendarResult,
          caption: '📅 Calendário de Disponibilidade (Teste Sequência)'
        });
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
      } else if (step.type === 'confirmation') {
        // Exatamente como no fluxo oficial
        text = etapa9Confirm(
          {
            name: 'Cliente Teste',
            vehicle: 'Toyota Corolla 2022',
            services: 'Polimento Completo',
            day: '15/07/2026',
            time: '14:30',
            payment: 'PIX',
            value: '350.00',
            address: 'Rua Teste, 123'
          },
          wctx.prompts
        );
      } else {
        text = `Teste de etapa: ${step.name}`;
      }

      if (text) {
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
