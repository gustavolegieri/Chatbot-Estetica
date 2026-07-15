import { NextRequest, NextResponse } from 'next/server';
import { sendText } from '@/lib/evolution-api';
import { sendMedia } from '@/lib/evolution-api';
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from '@/lib/calendar-helper';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';
import { etapa1Welcome, etapa2MainMenu, etapa4Vehicle, etapa4AskYear, etapa4VehicleConfirmation, etapa5Quote, etapa6Upsell, etapa7Day, etapa7Time, etapa8Payment, etapa8PixBlock, etapa8PixChoice, etapa9Confirm, serviceDetail, packageActionText, formatHours, type FlowContext } from '@/lib/whatsapp-flow-messages';
import { loadWhatsAppCatalog, buildMainMenu, subMenuForCategoryCtx } from '@/lib/whatsapp-service-catalog';
import { prisma } from '@/lib/prisma';
import { BRAND_DEFAULT } from '@/lib/whatsapp-catalog';
import { handleLogistics, handleSummaryConfirm, handleFinalConfirm, buildBudgetSummaryText, type FlowState, type FlowResponse, type FlowResult } from '@/lib/whatsapp-flow-core';

const STEPS = [
  { id: 'welcome', name: '1. Boas-Vindas', type: 'welcome', description: 'Mensagem inicial com informações da empresa' },
  { id: 'name_collection', name: '2. Coleta de Nome', type: 'name_collection', description: 'Solicita nome do cliente' },
  { id: 'main_menu', name: '3. Menu Principal', type: 'main_menu', description: 'Exibe categorias de serviços' },
  { id: 'submenu', name: '4. Submenu', type: 'submenu', description: 'Mostra serviços de uma categoria' },
  { id: 'undecided_vehicle', name: '5. Cliente Indeciso - Veículo', type: 'undecided_vehicle', description: 'Pede modelo do veículo para clientes indecisos' },
  { id: 'undecided_problem', name: '6. Cliente Indeciso - Problema', type: 'undecided_problem', description: 'Identifica problema e recomenda serviço' },
  { id: 'package_action', name: '7. Ações com Pacotes', type: 'package_action', description: 'Opções após selecionar pacote' },
  { id: 'service_action', name: '8. Ações Após Serviço', type: 'service_action', description: 'Opções após selecionar serviço' },
  { id: 'vehicle_collection', name: '9. Coleta de Veículo', type: 'vehicle_collection', description: 'Coleta modelo, ano, cor e estado' },
  { id: 'quote', name: '10. Orçamento', type: 'quote', description: 'Exibe preço estimado do serviço' },
  { id: 'first_time_bonus', name: '11. Bônus Primeira Vez', type: 'first_time_bonus', description: 'Oferece desconto de 10% para novos clientes' },
  { id: 'upsell', name: '12. Upsell', type: 'upsell', description: 'Oferece serviços complementares' },
  { id: 'day_selection', name: '13. Escolha de Dia', type: 'day_selection', description: 'Envia calendário para seleção de data' },
  { id: 'time_selection', name: '14. Escolha de Horário', type: 'time_selection', description: 'Exibe horários disponíveis' },
  { id: 'coupon', name: '15. Cupom', type: 'coupon', description: 'Solicita código de cupom de desconto' },
  { id: 'loyalty', name: '16. Pontos de Fidelidade', type: 'loyalty', description: 'Opções para usar pontos de fidelidade' },
  { id: 'budget_confirmation', name: '17. Confirmação de Orçamento', type: 'budget_confirmation', description: 'Confirma valor total antes de prosseguir' },
  { id: 'logistics', name: '18. Logística', type: 'logistics', description: 'Opções de entrega/retirada do veículo' },
  { id: 'payment', name: '19. Pagamento', type: 'payment', description: 'Exibe formas de pagamento disponíveis' },
  { id: 'pix_choice', name: '20. Escolha PIX', type: 'pix_choice', description: 'Opções de pagamento PIX (agora/entrega)' },
  { id: 'receipt_upload', name: '21. Comprovante', type: 'receipt_upload', description: 'Solicita upload de comprovante de pagamento' },
  { id: 'reminder', name: '22. Lembrete', type: 'reminder', description: 'Configura lembrete do agendamento' },
  { id: 'summary_confirmation', name: '23. Resumo e Confirmação', type: 'summary_confirmation', description: 'Resumo completo e confirmação final' },
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
    vehicleCondition: 'bom',
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
      // 1. BOAS-VINDAS
      text = etapa1Welcome(ctx, wctx.prompts);
    } else if (step.type === 'name_collection') {
      // 2. COLETA DE NOME
      text = 'Olá! 😊 Para começar, qual é o seu nome?';
    } else if (step.type === 'main_menu') {
      // 3. MENU PRINCIPAL
      text = buildMainMenu(wctx.categories, wctx.prompts);
    } else if (step.type === 'submenu') {
      // 4. SUBMENU
      const firstCategory = Object.keys(wctx.categories)[0];
      text = subMenuForCategoryCtx(1, wctx);
    } else if (step.type === 'undecided_vehicle') {
      // 5. CLIENTE INDECISO - VEÍCULO
      text = 'Qual é o modelo do seu veículo? 🚗\n\n_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_';
    } else if (step.type === 'undecided_problem') {
      // 6. CLIENTE INDECISO - PROBLEMA
      text = 'Perfeito 🚗\n\nO que está acontecendo?\n\n1 🎨 Pintura opaca, riscada ou sem brilho\n2 🪑 Interior com cheiro ruim ou muito sujo\n3 🛡️ Quero proteger um carro novo ou recém-comprado\n4 ✨ Quero um cuidado geral completo\n5 🔧 Outro problema';
    } else if (step.type === 'package_action') {
      // 7. AÇÕES COM PACOTES
      text = packageActionText(wctx.prompts);
    } else if (step.type === 'service_action') {
      // 8. AÇÕES APÓS SERVIÇO
      const firstService = Object.values(wctx.catalog)[0];
      if (firstService) {
        text = serviceDetail(firstService, wctx.prompts);
      } else {
        text = 'Nenhum serviço disponível no catálogo';
      }
    } else if (step.type === 'vehicle_collection') {
      // 9. COLETA DE VEÍCULO
      text = 'Qual é o modelo do seu veículo? 🚗\n\n_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_';
    } else if (step.type === 'quote') {
      // 10. ORÇAMENTO
      const firstService = Object.values(wctx.catalog)[0];
      if (firstService) {
        text = etapa5Quote(
          'Cliente Teste',
          'Toyota Corolla 2022 Branco',
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
    } else if (step.type === 'first_time_bonus') {
      // 11. BÔNUS PRIMEIRA VEZ
      text = '🎁 Bônus! Primeira vez: 10% de desconto\n\nÉ sua primeira vez aqui! Ganhou 10% de desconto no primeiro serviço.\n\n💰 Desconto: R$ 35,00\n\n1 ✅ Quero o desconto\n2 ❌ Não, obrigado';
    } else if (step.type === 'upsell') {
      // 12. UPSELL
      text = '✨ Que tal adicionar Vitrificação Cerâmica?\n\n💰 R$ 150,00 a mais\n\n1 - Sim, incluir\n2 - Não, obrigado';
    } else if (step.type === 'day_selection') {
      // 13. ESCOLHA DE DIA
      text = etapa7Day(wctx.prompts);
    } else if (step.type === 'time_selection') {
      // 14. ESCOLHA DE HORÁRIO
      const slots = ['08:00', '10:00', '14:00', '16:00'];
      text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
    } else if (step.type === 'coupon') {
      // 15. CUPOM
      text = 'Perfeito 😊 Me envie o código do cupom (ex: AA).';
    } else if (step.type === 'loyalty') {
      // 16. PONTOS DE FIDELIDADE
      text = '🌟 Você tem 100 pontos de fidelidade!\n\nDeseja usar seus pontos para desconto?\n\n1 - Sim, usar pontos\n2 - Não, guardar pontos';
    } else if (step.type === 'budget_confirmation') {
      // 17. CONFIRMAÇÃO DE ORÇAMENTO
      text = '🚚 Como prefere?\n\n1 - Deixe eu levo o carro até a estética\n2 - A estética vai buscar o carro';
    } else if (step.type === 'logistics') {
      // 18. LOGÍSTICA
      const testState = await createTestFlowState('ETAPA10_LOGISTICS');
      const responses: FlowResponse[] = [];
      
      const result = await handleLogistics(testState, '1', responses);
      
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
    } else if (step.type === 'payment') {
      // 19. PAGAMENTO
      text = etapa8Payment(true, wctx.prompts);
    } else if (step.type === 'pix_choice') {
      // 20. ESCOLHA PIX
      text = '💸 Como você prefere pagar via PIX?\n\n1 PIX (Pagar agora)\n2 PIX (Pagar na entrega)';
    } else if (step.type === 'receipt_upload') {
      // 21. COMPROVANTE
      text = 'Por favor, envie o comprovante de pagamento para confirmarmos seu agendamento.';
    } else if (step.type === 'reminder') {
      // 22. LEMBRETE
      text = '🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?\n\n*1* Sim, quero lembrete\n*2* Não precisa';
    } else if (step.type === 'summary_confirmation') {
      // 23. RESUMO E CONFIRMAÇÃO
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
    } else {
      text = `Teste de etapa: ${step.name}`;
    }

    const result = await sendText({
      number: phone,
      text
    });
    
    // Verificar se houve erro (incluindo limite diário)
    if (result && typeof result === 'object' && 'error' in result) {
      const errorResult = result as any;
      if (errorResult.status === 429) {
        return NextResponse.json({ 
          success: false, 
          message: `Limite diário da API atingido (50 mensagens). Aguarde o reset diário ou faça upgrade para plano pago.`,
          dailyLimit: true
        });
      }
      return NextResponse.json({ 
        success: false, 
        message: `Erro ao enviar etapa: ${errorResult.message || 'Erro desconhecido'}`,
        error: errorResult.message
      });
    }
    
    // Verificar se foi enfileirado (rate limit temporário)
    if (result && typeof result === 'object' && 'queued' in result) {
      return NextResponse.json({ 
        success: true, 
        message: `Etapa "${step.name}" na fila de envio para ${phone} (rate limit temporário - será enviada em até 30s)`,
        queued: true
      });
    }
    
    // Se foi bloqueado (não é chat privado)
    if (result && typeof result === 'object' && 'blocked' in result) {
      return NextResponse.json({ 
        success: false, 
        message: `Envio bloqueado: ${(result as any).reason || 'Motivo desconhecido'}`,
        blocked: true
      });
    }
    
    // Se foi simulado (API não configurada)
    if (result && typeof result === 'object' && 'simulated' in result) {
      return NextResponse.json({ 
        success: false, 
        message: `API não configurada - mensagem simulada`,
        simulated: true
      });
    }
    
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
        // 1. BOAS-VINDAS
        text = etapa1Welcome(ctx, wctx.prompts);
      } else if (step.type === 'name_collection') {
        // 2. COLETA DE NOME
        text = 'Olá! 😊 Para começar, qual é o seu nome?';
      } else if (step.type === 'main_menu') {
        // 3. MENU PRINCIPAL
        text = buildMainMenu(wctx.categories, wctx.prompts);
      } else if (step.type === 'submenu') {
        // 4. SUBMENU
        text = subMenuForCategoryCtx(1, wctx);
      } else if (step.type === 'undecided_vehicle') {
        // 5. CLIENTE INDECISO - VEÍCULO
        text = 'Qual é o modelo do seu veículo? 🚗\n\n_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_';
      } else if (step.type === 'undecided_problem') {
        // 6. CLIENTE INDECISO - PROBLEMA
        text = 'Perfeito 🚗\n\nO que está acontecendo?\n\n1 🎨 Pintura opaca, riscada ou sem brilho\n2 🪑 Interior com cheiro ruim ou muito sujo\n3 🛡️ Quero proteger um carro novo ou recém-comprado\n4 ✨ Quero um cuidado geral completo\n5 🔧 Outro problema';
      } else if (step.type === 'package_action') {
        // 7. AÇÕES COM PACOTES
        text = packageActionText(wctx.prompts);
      } else if (step.type === 'service_action') {
        // 8. AÇÕES APÓS SERVIÇO
        const firstService = Object.values(wctx.catalog)[0];
        if (firstService) {
          text = serviceDetail(firstService, wctx.prompts);
        } else {
          text = 'Nenhum serviço disponível no catálogo';
        }
      } else if (step.type === 'vehicle_collection') {
        // 9. COLETA DE VEÍCULO
        text = 'Qual é o modelo do seu veículo? 🚗\n\n_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_';
      } else if (step.type === 'quote') {
        // 10. ORÇAMENTO
        const firstService = Object.values(wctx.catalog)[0];
        if (firstService) {
          text = etapa5Quote(
            'Cliente Teste',
            'Toyota Corolla 2022 Branco',
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
      } else if (step.type === 'first_time_bonus') {
        // 11. BÔNUS PRIMEIRA VEZ
        text = '🎁 Bônus! Primeira vez: 10% de desconto\n\nÉ sua primeira vez aqui! Ganhou 10% de desconto no primeiro serviço.\n\n💰 Desconto: R$ 35,00\n\n1 ✅ Quero o desconto\n2 ❌ Não, obrigado';
      } else if (step.type === 'upsell') {
        // 12. UPSELL
        text = '✨ Que tal adicionar Vitrificação Cerâmica?\n\n💰 R$ 150,00 a mais\n\n1 - Sim, incluir\n2 - Não, obrigado';
      } else if (step.type === 'day_selection') {
        // 13. ESCOLHA DE DIA
        text = etapa7Day(wctx.prompts);
      } else if (step.type === 'time_selection') {
        // 14. ESCOLHA DE HORÁRIO
        const slots = ['08:00', '10:00', '14:00', '16:00'];
        text = etapa7Time('15/07/2026', slots, '2 horas', wctx.prompts);
      } else if (step.type === 'coupon') {
        // 15. CUPOM
        text = 'Perfeito 😊 Me envie o código do cupom (ex: AA).';
      } else if (step.type === 'loyalty') {
        // 16. PONTOS DE FIDELIDADE
        text = '🌟 Você tem 100 pontos de fidelidade!\n\nDeseja usar seus pontos para desconto?\n\n1 - Sim, usar pontos\n2 - Não, guardar pontos';
      } else if (step.type === 'budget_confirmation') {
        // 17. CONFIRMAÇÃO DE ORÇAMENTO
        text = '🚚 Como prefere?\n\n1 - Deixe eu levo o carro até a estética\n2 - A estética vai buscar o carro';
      } else if (step.type === 'logistics') {
        // 18. LOGÍSTICA
        const testState = await createTestFlowState('ETAPA10_LOGISTICS');
        const responses: FlowResponse[] = [];
        
        const result = await handleLogistics(testState, '1', responses);
        
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
        continue;
      } else if (step.type === 'payment') {
        // 19. PAGAMENTO
        text = etapa8Payment(true, wctx.prompts);
      } else if (step.type === 'pix_choice') {
        // 20. ESCOLHA PIX
        text = '💸 Como você prefere pagar via PIX?\n\n1 PIX (Pagar agora)\n2 PIX (Pagar na entrega)';
      } else if (step.type === 'receipt_upload') {
        // 21. COMPROVANTE
        text = 'Por favor, envie o comprovante de pagamento para confirmarmos seu agendamento.';
      } else if (step.type === 'reminder') {
        // 22. LEMBRETE
        text = '🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?\n\n*1* Sim, quero lembrete\n*2* Não precisa';
      } else if (step.type === 'summary_confirmation') {
        // 23. RESUMO E CONFIRMAÇÃO
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
        continue;
      } else {
        text = `Teste de etapa: ${step.name}`;
      }

      if (text) {
        const result = await sendText({
          number: phone,
          text
        });
        
        if (result && typeof result === 'object' && 'queued' in result) {
          console.log(`[Teste Fluxo] Etapa ${step.id} na fila (rate limit)`);
        }
      }

      session.currentStep = i + 1;
      session.currentStepName = step.name;
      testFluxoStorage.set(sessionId, session);

      if (i < STEPS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 35000)); // 35 segundos para respeitar rate limit da API gratuita
      }
    } catch (error) {
      console.error(`[Teste Fluxo] Erro na etapa ${step.id}:`, error);
    }
  }

  session.completed = true;
  testFluxoStorage.set(sessionId, session);
}
