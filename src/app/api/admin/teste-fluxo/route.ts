import { NextRequest, NextResponse } from 'next/server';
import { sendText } from '@/lib/evolution-api';
import { sendMedia } from '@/lib/evolution-api';
import { sendCalendarWithImageAndList } from '@/lib/calendar-helper';
import { generateSummaryCard } from '@/lib/summary-card';
import { testFluxoStorage } from '@/lib/test-fluxo-storage';
import { etapa1Welcome, etapa2MainMenu, etapa4Vehicle, etapa4AskYear, etapa5Quote, etapa6Upsell, etapa7Day, etapa7Time, etapa8Payment, etapa8PixBlock, etapa9Confirm, serviceDetail, formatHours, type FlowContext } from '@/lib/whatsapp-flow-messages';
import { loadWhatsAppCatalog, buildMainMenu } from '@/lib/whatsapp-service-catalog';
import { prisma } from '@/lib/prisma';
import { BRAND_DEFAULT } from '@/lib/whatsapp-catalog';

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
      // Mostra pacotes
      const packageItem = wctx.catalog['pacotes'];
      if (packageItem) {
        text = serviceDetail(packageItem, wctx.prompts);
      } else {
        text = 'Pacotes não disponíveis';
      }
    } else if (step.type === 'vehicle') {
      // Exatamente como no fluxo oficial
      text = etapa4Vehicle(false, wctx.prompts);
    } else if (step.type === 'vehicle_confirm') {
      // Solicita ano do veículo
      text = etapa4AskYear('Toyota Corolla', wctx.prompts);
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
      // Instrução de pagamento PIX
      text = etapa8PixBlock(ctx, wctx.prompts);
    } else if (step.type === 'logistics') {
      // Opções de logística
      text = `🚚 *LOGÍSTICA*\n\n1️⃣ Leva e traz\n2️⃣ Busca no local\n3️⃣ Entrego no local\n\n_Digite a opção desejada_`;
    } else if (step.type === 'calendar') {
      // Exatamente como no fluxo oficial
      await sendCalendarWithImageAndList({ number: phone, prompts: wctx.prompts });
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
      } else if (step.type === 'service_detail') {
        // Mostra detalhe de um serviço específico
        const firstService = Object.values(wctx.catalog)[0];
        if (firstService) {
          text = serviceDetail(firstService, wctx.prompts);
        } else {
          text = 'Nenhum serviço disponível no catálogo';
        }
      } else if (step.type === 'package') {
        // Mostra pacotes
        const packageItem = wctx.catalog['pacotes'];
        if (packageItem) {
          text = serviceDetail(packageItem, wctx.prompts);
        } else {
          text = 'Pacotes não disponíveis';
        }
      } else if (step.type === 'vehicle') {
        // Exatamente como no fluxo oficial
        text = etapa4Vehicle(false, wctx.prompts);
      } else if (step.type === 'vehicle_confirm') {
        // Solicita ano do veículo
        text = etapa4AskYear('Toyota Corolla', wctx.prompts);
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
        // Instrução de pagamento PIX
        text = etapa8PixBlock(ctx, wctx.prompts);
      } else if (step.type === 'logistics') {
        // Opções de logística
        text = `🚚 *LOGÍSTICA*\n\n1️⃣ Leva e traz\n2️⃣ Busca no local\n3️⃣ Entrego no local\n\n_Digite a opção desejada_`;
      } else if (step.type === 'calendar') {
        // Exatamente como no fluxo oficial
        await sendCalendarWithImageAndList({ number: phone, prompts: wctx.prompts });
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
