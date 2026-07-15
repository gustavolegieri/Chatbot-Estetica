import { NextRequest, NextResponse } from 'next/server';
import { sendText } from '@/lib/evolution-api';
import { sendMedia } from '@/lib/evolution-api';
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from '@/lib/calendar-helper';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';
import { etapa1Welcome, etapa2MainMenu, etapa4Vehicle, etapa4AskYear, etapa4VehicleConfirmation, etapa5Quote, etapa6Upsell, etapa7Day, etapa7Time, etapa8Payment, etapa8PixBlock, etapa8PixChoice, etapa9Confirm, serviceDetail, packageActionText, formatHours, type FlowContext } from '@/lib/whatsapp-flow-messages';
import { loadWhatsAppCatalog, buildMainMenu } from '@/lib/whatsapp-service-catalog';
import { prisma } from '@/lib/prisma';
import { BRAND_DEFAULT } from '@/lib/whatsapp-catalog';
import { handleLogistics, handleSummaryConfirm, handleFinalConfirm, buildBudgetSummaryText, type FlowState, type FlowResponse, type FlowResult } from '@/lib/whatsapp-flow-core';

const STEPS = [
  { id: 'welcome', name: 'Boas-vindas', type: 'welcome', description: 'Mensagem inicial do bot' },
  { id: 'menu', name: 'Menu Principal', type: 'menu', description: 'Exibe opções principais do sistema' },
  { id: 'service_detail', name: 'Detalhe de Serviço', type: 'service_detail', description: 'Mostra detalhes de um serviço específico' },
  { id: 'package', name: 'Pacotes', type: 'package', description: 'Mostra pacotes disponíveis' },
  { id: 'vehicle', name: 'Seleção de Veículo', type: 'vehicle', description: 'Solicita informações do veículo' },
  { id: 'vehicle_confirm', name: 'Confirmação Veículo', type: 'vehicle_confirm', description: 'Confirma os dados do veículo' },
  { id: 'quote', name: 'Cotação', type: 'quote', description: 'Exibe preço estimado' },
  { id: 'upsell', name: 'Upsell', type: 'upsell', description: 'Oferece serviços complementares' },
  { id: 'day', name: 'Seleção de Data', type: 'day', description: 'Solicita data do agendamento' },
  { id: 'time', name: 'Seleção de Horário', type: 'time', description: 'Solicita horário do agendamento' },
  { id: 'payment', name: 'Formas de Pagamento', type: 'payment', description: 'Exibe opções de pagamento' },
  { id: 'payment_pix', name: 'Pagamento PIX', type: 'payment_pix', description: 'Instruções de pagamento PIX' },
  { id: 'logistics', name: 'Logística', type: 'logistics', description: 'Opções de entrega/retirada' },
  { id: 'calendar', name: 'Calendário', type: 'calendar', description: 'Envia imagem do calendário' },
  { id: 'summary', name: 'Resumo', type: 'summary', description: 'Resumo do agendamento' },
  { id: 'confirmation', name: 'Confirmação', type: 'confirmation', description: 'Confirmação final do agendamento' },
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

// Cria um FlowState simulado para teste, com dados de exemplo
async function createTestFlowState(stage: string): Promise<FlowState> {
  const wctx = await loadWhatsAppCatalog();
  const firstService = Object.keys(wctx.catalog)[0];
  
  return {
    stage: stage as any,
    welcomed: true,
    customerName: 'Cliente Teste',
    serviceKey: firstService,
    serviceLabel: 'Polimento Completo',
    vehicleModel: 'Toyota Corolla',
    vehicleYear: '2022',
    vehicleColor: 'Branco',
    dbServiceId: 'test-service-id',
    quoteMin: 350.00,
    quoteMax: 350.00,
    dayDate: '2026-07-15',
    startTime: '14:30',
    paymentMethod: 'PIX',
    pickupAddress: 'Rua Teste, 123',
    pickupFee: 0,
    needsPickup: false,
    needsReturn: false,
    vehicleConfirmed: true,
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
    } else if (step.type === 'service_detail') {
      // Mostra detalhe de um serviço específico
      const firstService = Object.values(wctx.catalog)[0];
      if (firstService) {
        text = serviceDetail(firstService, wctx.prompts);
      } else {
        text = 'Nenhum serviço disponível no catálogo';
      }
    } else if (step.type === 'package') {
      // Usar a função real do fluxo
      text = packageActionText(wctx.prompts);
    } else if (step.type === 'vehicle') {
      // Exatamente como no fluxo oficial
      text = etapa4Vehicle(false, wctx.prompts);
    } else if (step.type === 'vehicle_confirm') {
      // Usar a função real de confirmação de veículo
      text = etapa4VehicleConfirmation('Toyota Corolla', '2022', 'Branco', 'Excelente');
    } else if (step.type === 'quote') {
      // Exibe cotação
      const firstService = Object.values(wctx.catalog)[0];
      if (firstService) {
        text = etapa5Quote(
          'Cliente Teste',
          'Toyota Corolla 2022',
          firstService.label,
          firstService.hatchMin || 500,
          firstService.hatchMax || 700,
          firstService.time || '2 horas',
          firstService.pitch || '',
          wctx.prompts
        );
      } else {
        text = 'Não foi possível gerar cotação';
      }
    } else if (step.type === 'upsell') {
      // Oferece upsell
      text = etapa6Upsell('Polimento', 'Vitrificação', 'Proteção extra para sua pintura', wctx.prompts);
    } else if (step.type === 'day') {
      // Exatamente como no fluxo oficial
      text = etapa7Day(wctx.prompts);
    } else if (step.type === 'time') {
      // Exatamente como no fluxo oficial
      const slots = ['08:00', '10:00', '14:00', '16:00'];
      text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
    } else if (step.type === 'payment') {
      // Exatamente como no fluxo oficial
      text = etapa8Payment(true, wctx.prompts);
    } else if (step.type === 'payment_pix') {
      // Instrução de pagamento PIX - usar ambas as funções reais
      const pixBlock = etapa8PixBlock(ctx, wctx.prompts);
      const pixChoice = etapa8PixChoice(wctx.prompts);
      text = `${pixBlock}\n\n${pixChoice}`;
    } else if (step.type === 'logistics') {
      // Usar a função real do flow-core
      const testState = await createTestFlowState('ETAPA10_LOGISTICS');
      const responses: FlowResponse[] = [];
      
      // Simular seleção de "Leva e traz" (opção 1)
      const result = await handleLogistics(testState, '1', responses);
      
      // Enviar todas as respostas geradas pela função real
      for (const response of result.responses) {
        if (response.mediaUrl) {
          await sendMedia({
            number: phone,
            mediaUrl: response.mediaUrl,
            caption: response.text
          });
        } else {
          await sendText({
            number: phone,
            text: response.text
          });
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Logística enviada para ${phone} usando fluxo real`,
        type: 'logistics'
      });
    } else if (step.type === 'calendar') {
      // Usar a função real de teste com conversão PNG
      const calendarImagePath = await generateCalendarImageOnlyForTest(null);
      const legend = generateCalendarLegend();
      
      await sendMedia({
        number: phone,
        mediaUrl: calendarImagePath,
        caption: legend
      });
      
      return NextResponse.json({ 
        success: true, 
        message: `Calendário enviado para ${phone}`,
        type: 'calendar'
      });
    } else if (step.type === 'summary') {
      // Usar a função real do fluxo para texto de resumo
      const testState = await createTestFlowState('ETAPA15_SUMMARY_CONFIRM');
      const serviceValue = testState.quoteMin || 350.00;
      const pickupFee = testState.pickupFee || 0;
      const summaryText = buildBudgetSummaryText({
        serviceLabel: testState.serviceLabel,
        serviceValue: serviceValue,
        complementValue: 0,
        couponDiscount: 0,
        loyaltyDiscount: 0,
        pickupFee: pickupFee,
        totalValue: serviceValue + pickupFee
      });
      
      await sendText({
        number: phone,
        text: summaryText
      });
      
      return NextResponse.json({ 
        success: true, 
        message: `Resumo enviado para ${phone}`,
        type: 'summary'
      });
    } else if (step.type === 'confirmation') {
      // Usar a função real de confirmação final
      const testState = await createTestFlowState('ETAPA16_CONFIRMATION');
      const responses: FlowResponse[] = [];
      
      const result = await handleFinalConfirm(testState, '1', responses);
      
      // Enviar todas as respostas geradas pela função real
      for (const response of result.responses) {
        if (response.mediaUrl) {
          await sendMedia({
            number: phone,
            mediaUrl: response.mediaUrl,
            caption: response.text
          });
        } else {
          await sendText({
            number: phone,
            text: response.text
          });
        }
      }
      
      return NextResponse.json({ 
        success: true, 
        message: `Confirmação enviada para ${phone} usando fluxo real`,
        type: 'confirmation'
      });
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
      } else if (step.type === 'service_detail') {
        // Mostra detalhe de um serviço específico
        const firstService = Object.values(wctx.catalog)[0];
        if (firstService) {
          text = serviceDetail(firstService, wctx.prompts);
        } else {
          text = 'Nenhum serviço disponível no catálogo';
        }
      } else if (step.type === 'package') {
        // Usar a função real do fluxo
        text = packageActionText(wctx.prompts);
      } else if (step.type === 'vehicle') {
        // Exatamente como no fluxo oficial
        text = etapa4Vehicle(false, wctx.prompts);
      } else if (step.type === 'vehicle_confirm') {
        // Usar a função real de confirmação de veículo
        text = etapa4VehicleConfirmation('Toyota Corolla', '2022', 'Branco', 'Excelente');
      } else if (step.type === 'quote') {
        // Exibe cotação
        const firstService = Object.values(wctx.catalog)[0];
        if (firstService) {
          text = etapa5Quote(
            'Cliente Teste',
            'Toyota Corolla 2022',
            firstService.label,
            firstService.hatchMin || 500,
            firstService.hatchMax || 700,
            firstService.time || '2 horas',
            firstService.pitch || '',
            wctx.prompts
          );
        } else {
          text = 'Não foi possível gerar cotação';
        }
      } else if (step.type === 'upsell') {
        // Oferece upsell
        text = etapa6Upsell('Polimento', 'Vitrificação', 'Proteção extra para sua pintura', wctx.prompts);
      } else if (step.type === 'day') {
        // Exatamente como no fluxo oficial
        text = etapa7Day(wctx.prompts);
      } else if (step.type === 'time') {
        // Exatamente como no fluxo oficial
        const slots = ['08:00', '10:00', '14:00', '16:00'];
        text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
      } else if (step.type === 'payment') {
        // Exatamente como no fluxo oficial
        text = etapa8Payment(true, wctx.prompts);
      } else if (step.type === 'payment_pix') {
        // Instrução de pagamento PIX - usar ambas as funções reais
        const pixBlock = etapa8PixBlock(ctx, wctx.prompts);
        const pixChoice = etapa8PixChoice(wctx.prompts);
        text = `${pixBlock}\n\n${pixChoice}`;
      } else if (step.type === 'logistics') {
        // Usar a função real do flow-core
        const testState = await createTestFlowState('ETAPA10_LOGISTICS');
        const responses: FlowResponse[] = [];
        
        // Simular seleção de "Leva e traz" (opção 1)
        const result = await handleLogistics(testState, '1', responses);
        
        // Enviar todas as respostas geradas pela função real
        for (const response of result.responses) {
          if (response.mediaUrl) {
            await sendMedia({
              number: phone,
              mediaUrl: response.mediaUrl,
              caption: response.text
            });
          } else {
            await sendText({
              number: phone,
              text: response.text
            });
          }
        }
        continue; // Pular o envio normal de texto abaixo
      } else if (step.type === 'calendar') {
        // Usar a função real de teste com conversão PNG
        const calendarImagePath = await generateCalendarImageOnlyForTest(null);
        const legend = generateCalendarLegend();
        
        await sendMedia({
          number: phone,
          mediaUrl: calendarImagePath,
          caption: legend
        });
        continue; // Pular o envio normal de texto abaixo
      } else if (step.type === 'summary') {
        // Usar a função real do fluxo para texto de resumo
        const testState = await createTestFlowState('ETAPA15_SUMMARY_CONFIRM');
        const serviceValue = testState.quoteMin || 350.00;
        const pickupFee = testState.pickupFee || 0;
        const summaryText = buildBudgetSummaryText({
          serviceLabel: testState.serviceLabel,
          serviceValue: serviceValue,
          complementValue: 0,
          couponDiscount: 0,
          loyaltyDiscount: 0,
          pickupFee: pickupFee,
          totalValue: serviceValue + pickupFee
        });
        
        await sendText({
          number: phone,
          text: summaryText
        });
        continue; // Pular o envio normal de texto abaixo
      } else if (step.type === 'confirmation') {
        // Usar a função real de confirmação final
        const testState = await createTestFlowState('ETAPA16_CONFIRMATION');
        const responses: FlowResponse[] = [];
        
        const result = await handleFinalConfirm(testState, '1', responses);
        
        // Enviar todas as respostas geradas pela função real
        for (const response of result.responses) {
          if (response.mediaUrl) {
            await sendMedia({
              number: phone,
              mediaUrl: response.mediaUrl,
              caption: response.text
            });
          } else {
            await sendText({
              number: phone,
              text: response.text
            });
          }
        }
        continue; // Pular o envio normal de texto abaixo
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
