
import type { FlowState } from "./whatsapp-flow-types";


import { renderPrompt, loadPromptMap, type PromptMap } from "./bot-prompts";
import { parseVehicleMessage, type ParsedVehicle } from "./whatsapp-vehicle-parse";
import { prisma } from "./prisma";
import { buildMainMenu, loadWhatsAppCatalog } from "./whatsapp-service-catalog";

function getCatalogForTest() {
  return (globalThis as any)?.__BB_WCTX_MOCK__ ?? null;
}

function getPrismaForTest() {
  return (globalThis as any)?.__BB_PRISMA_MOCK__ ?? null;
}

import {
  buildCalendarPrompt,
  buildVehicleCollectionPrompt,
  buildVehicleConfirmationPrompt,
  isValidCustomerName,
  normalizeVehicleConditionValue,
} from "./flow-validation";
import {
  etapa1Welcome,
  etapa2MainMenu,
  serviceDetail,
  serviceActionMenu,
} from "./whatsapp-flow-messages";

interface TestSession {
  stage: string;
  welcomed: boolean;
  customerName: string | null;
  selectedService: string | null;
  selectedSubService: string | null;
  selectedServiceName: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  vehiclePhotoAttached?: boolean;
  vehicle: {
    model: string | null;
    year: number | null;
    color: string | null;
    condition: "excelente" | "bom" | "normal" | "ruim";
  };
  quote: number | null;
  upsellOffer: any | null;
}

interface TestResponse {
  text: string;
  mediaUrl?: string;
  mediaType?: string;
}

export function buildBudgetSummaryText(params: {
  serviceLabel?: string | null;
  serviceValue?: number | null;
  complementValue?: number | null;
  couponDiscount?: number | null;
  totalValue?: number | null;
}) {
  const serviceValue = Number(params.serviceValue ?? 0);
  const complementValue = Number(params.complementValue ?? 0);
  const couponDiscount = Number(params.couponDiscount ?? 0);
  const totalValue = Number(params.totalValue ?? serviceValue + complementValue - couponDiscount);

  return [
    "━━━━━━━━━━━━━━━",
    "📋 Seu orçamento",
    `- Serviço: ${params.serviceLabel ?? "Serviço premium"} — R$ ${serviceValue.toFixed(2).replace(".", ",")}`,
    `- Complemento: R$ ${complementValue.toFixed(2).replace(".", ",")}`,
    `- Cupom: - R$ ${couponDiscount.toFixed(2).replace(".", ",")}`,
    `- Total: R$ ${totalValue.toFixed(2).replace(".", ",")}`,
    "━━━━━━━━━━━━━━━",
  ].join("\n");
}

export function buildPaymentOptionsText() {
  return [
    "Como você gostaria de pagar?",
    "",
    "*1* - PIX",
    "*2* - Cartão",
    "*3* - Dinheiro",
  ].join("\n");
}

export function buildTestServiceLookupWhere(
  catalogKey?: string | null,
  serviceName?: string | null
) {
  const where: Record<string, unknown> = { active: true };
  const ors: Array<Record<string, unknown>> = [];

  if (catalogKey) {
    ors.push({ catalogKey });
  }

  if (serviceName) {
    ors.push({ name: { contains: serviceName, mode: "insensitive" } });
  }

  if (ors.length > 0) {
    where.OR = ors;
  }

  return where;
}

export function normalizeConditionValue(
  value: string
): "excelente" | "bom" | "normal" | "ruim" {
  const normalized = normalizeVehicleConditionValue(value);
  if (normalized === "excelente") return "excelente";
  if (normalized === "bom") return "bom";
  if (normalized === "precisa de atenção") return "ruim";
  return "normal";
}

async function resolveTestService(session: TestSession) {
  const where = buildTestServiceLookupWhere(session.selectedSubService, session.selectedServiceName);
  const prismaMock = getPrismaForTest();

  const dbService = prismaMock?.service?.findFirst
    ? await prismaMock.service.findFirst({
        where,
        include: { media: true },
      })
    : await prisma.service.findFirst({
        where,
        include: { media: true },
      });


  if (dbService) {
    return { dbService };
  }

  const wctx = await loadWhatsAppCatalog(true);
  const catalogItem = session.selectedSubService ? wctx.catalog[session.selectedSubService] : null;

  return { dbService: null, catalogItem };
}

export async function processTestFlow({
  sessionId,
  message,
  session,
  settings,
  catalog,
}: {
  sessionId: string;
  message: string;
  session: TestSession;
  settings: any;
  catalog: any[];
}): Promise<TestResponse[]> {
  const responses: TestResponse[] = [];
  const prompts = await loadPromptMap();

  if (/falar com (o )?(dono|atendente|humano|pessoa)|atendimento humano|humano por favor|quero um atendente/i.test(message)) {
    responses.push({ text: "Entendi 😊 Vou encaminhar sua solicitação para a equipe da Garagem do Ka. Enquanto isso, pode continuar descrevendo sua dúvida." });
    return responses;
  }

  // Verificar intenção de "menu"
  if (message.toLowerCase() === "menu") {
    session.stage = "ETAPA2_MAIN_MENU";
    const wctx = getCatalogForTest() ?? (await loadWhatsAppCatalog(true));

    const menuText = etapa2MainMenu(
      session.customerName || "Cliente",
      buildMainMenu(wctx.categories, prompts),
      prompts
    );
    responses.push({ text: menuText });
    return responses;
  }

  // Processar por estágio
  switch (session.stage) {
    case "ETAPA1_AWAITING_NAME":
      return handleNameCollection(message, session, settings, prompts, responses);

    case "ETAPA2_MAIN_MENU":
      return handleMainMenu(message, session, settings, catalog, prompts, responses);

    case "ETAPA2_SUB":
      return handleSubMenu(message, session, settings, catalog, prompts, responses);

    case "ETAPA3_SERVICE_ACTION":
      return handleServiceAction(message, session, settings, catalog, prompts, responses);

    case "ETAPA4_VEHICLE":
      return handleVehicleCollection(message, session, settings, catalog, prompts, responses);

    case "ETAPA5_QUOTE":
      return handleQuotePresentation(message, session, settings, catalog, prompts, responses);

    case "ETAPA6_UPSELL":
      return handleUpsell(message, session, settings, catalog, prompts, responses);

    case "ETAPA8_PHOTO":
      return handlePhotoStep(message, session, settings, catalog, prompts, responses);

    case "ETAPA9_COUPON":
      return handleCouponStep(message, session, settings, catalog, prompts, responses);

    case "ETAPA10_BUDGET":
      // placeholder: mantém fluxo existente do modo teste
      // (o transcript e o Vercel quebraram por referência a função inexistente)
      session.stage = "ETAPA7_DAY";
      return handleDateSelection("4", session, settings, catalog, prompts, responses);


    case "ETAPA7_DAY":
      return handleDateSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA7_TIME":
      return handleTimeSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA8_PAYMENT":
      return handlePaymentSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA10_FAQ":
      return handleFAQ(message, session, settings, catalog, prompts, responses);

    default:
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const menuText = etapa2MainMenu(
        session.customerName || "Cliente",
        buildMainMenu(wctx.categories, prompts),
        prompts
      );
      responses.push({ text: menuText });
      return responses;
  }
}

async function handleNameCollection(
  message: string,
  session: TestSession,
  settings: any,
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const name = message.trim().slice(0, 50);

  if (!isValidCustomerName(name)) {
    responses.push({ text: "Não consegui identificar seu nome 😊 Pode me dizer como posso te chamar?" });
    return responses;
  }

  session.customerName = name;
  session.stage = "ETAPA2_MAIN_MENU";

  const wctx = await loadWhatsAppCatalog(true);
  const menuText = etapa2MainMenu(name, buildMainMenu(wctx.categories, prompts), prompts);
  responses.push({ text: menuText });
  return responses;
}

async function handleMainMenu(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  // Validar número de menu (1-8)
  if (!/^[1-8]$/.test(choice)) {
    const wctx = await loadWhatsAppCatalog(true);
    const menuText = etapa2MainMenu(
      session.customerName || "Cliente",
      buildMainMenu(wctx.categories, prompts),
      prompts
    );
    responses.push({ text: "❌ Por favor, escolha uma opção de 1 a 8" });
    responses.push({ text: menuText });
    return responses;
  }

  // Mapear escolha para categoria
  const categoryMap: Record<string, string> = {
    "1": "lavagem",
    "2": "interior",
    "3": "pintura",
    "4": "limpeza",
    "5": "vidro",
    "6": "outros",
    "7": "pacotes",
    "8": "indeciso",
  };

  session.selectedService = categoryMap[choice];
  session.stage = "ETAPA2_SUB";

  // Obter serviços por categoria
  const wctx = await loadWhatsAppCatalog(true);
  const categoryServices = Object.values(wctx.catalog).filter((s: any) =>
    s.key.toLowerCase().includes(session.selectedService)
  );

  if (categoryServices.length === 0) {
    responses.push({ text: "Desculpe, nenhum serviço disponível nesta categoria." });
    session.stage = "ETAPA2_MAIN_MENU";
    const menuText = etapa2MainMenu(
      session.customerName || "Cliente",
      buildMainMenu(wctx.categories, prompts),
      prompts
    );
    responses.push({ text: menuText });
    return responses;
  }

  // Montar menu de sub-serviços
  let subMenu = "Escolha um serviço:\n\n";
  categoryServices.forEach((service: any, idx: number) => {
    subMenu += `*${idx + 1}* - ${service.label}\n`;
  });

  responses.push({ text: subMenu });
  return responses;
}

async function handleSubMenu(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = parseInt(message.trim());

  const wctx = await loadWhatsAppCatalog(true);
  const categoryServices = Object.values(wctx.catalog).filter((s: any) =>
    s.key.toLowerCase().includes(session.selectedService)
  );

  if (isNaN(choice) || choice < 1 || choice > categoryServices.length) {
    responses.push({ text: `❌ Escolha inválida. Por favor, escolha entre 1 e ${categoryServices.length}` });
    return responses;
  }

  const selectedService = categoryServices[choice - 1];
  session.selectedSubService = selectedService.key;
  session.selectedServiceName = selectedService.label;

  // Mostrar detalhe do serviço
  const description = serviceDetail(selectedService, prompts);
  responses.push({ text: description });

  // Incluir mídia se existir no banco de dados
  const prismaMock = getPrismaForTest();

  const dbService = prismaMock?.service?.findFirst
    ? await prismaMock.service.findFirst({
        where: {
          catalogKey: selectedService.key,
        },
        include: { media: true },
      })
    : await prisma.service.findFirst({
        where: {
          catalogKey: selectedService.key,
        },
        include: { media: true },
      });


  if (dbService?.media && dbService.media.length > 0) {
    const media = dbService.media[0];
    responses.push({
      text: `Veja uma imagem deste serviço:`,
      mediaUrl: media.path,
      mediaType: media.mimeType,
    });
  }

  session.stage = "ETAPA3_SERVICE_ACTION";
  responses.push({
    text: `O que você gostaria de fazer?\n\n*1* - Agendar\n*2* - Ver outros serviços\n*3* - Dúvida`,
  });

  return responses;
}

async function handleServiceAction(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  switch (choice) {
    case "1":
      // Agendar
      session.stage = "ETAPA4_VEHICLE";
      responses.push({
        text: "Para fornecer um orçamento preciso, me conte sobre seu veículo:\n\nEx: Honda Civic 2020, preto, em bom estado",
      });
      break;

    case "2":
      // Outros serviços
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const menuText = etapa2MainMenu(
        session.customerName || "Cliente",
        buildMainMenu(wctx.categories, prompts),
        prompts
      );
      responses.push({ text: menuText });
      break;

    case "3":
      // Dúvida
      session.stage = "ETAPA10_FAQ";
      responses.push({
        text: "Qual é sua dúvida? Vou tentar ajudar!",
      });
      break;

    default:
      responses.push({ text: "❌ Opção inválida. Escolha 1, 2 ou 3" });
      responses.push({
        text: `O que você gostaria de fazer?\n\n*1* - Agendar\n*2* - Ver outros serviços\n*3* - Dúvida`,
      });
  }

  return responses;
}

async function handleVehicleCollection(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  // Extrair informações do veículo
  const vehicleInfo = parseVehicleMessage(message);

  const normalizedCondition = normalizeConditionValue(vehicleInfo.condition);

  session.vehicle = {
    model: vehicleInfo.model,
    year: vehicleInfo.year ? parseInt(vehicleInfo.year) : null,
    color: vehicleInfo.color,
    condition: normalizedCondition,
  };

  if (!session.vehicle.model || !session.vehicle.year || !session.vehicle.color || !session.vehicle.condition) {
    responses.push({ text: buildVehicleCollectionPrompt({
      model: session.vehicle.model,
      year: session.vehicle.year?.toString() ?? null,
      color: session.vehicle.color,
      condition: session.vehicle.condition,
    }) });
    return responses;
  }

  session.stage = "ETAPA5_QUOTE";
  responses.push({
    text: buildVehicleConfirmationPrompt({
      model: session.vehicle.model,
      year: session.vehicle.year?.toString() ?? null,
      color: session.vehicle.color,
      condition: session.vehicle.condition,
    }),
  });
  return responses;
}

async function handlePhotoStep(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const wantsPhoto = /^(1|sim|s|foto|imagem|anexar)$/i.test(input);

  session.vehiclePhotoAttached = wantsPhoto;
  session.stage = "ETAPA9_COUPON";

  responses.push({
    text: wantsPhoto
      ? "Foto registrada como opcional. Seguimos com o agendamento."
      : "Sem foto anexada. Seguimos com o agendamento.",
  });
  responses.push({
    text: "Tem um cupom? Se tiver, me envie o código. Se não, diga *não*.",
  });

  return responses;
}

async function handleQuotePresentation(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim().toLowerCase();

  if (choice === "sim" || choice === "1" || choice === "yes") {
    const { dbService } = await resolveTestService(session);

    if (dbService?.upsellServiceId) {
      const upsellService = await prisma.service.findUnique({
        where: { id: dbService.upsellServiceId },
      });
      if (upsellService) {
        session.stage = "ETAPA6_UPSELL";
        session.upsellOffer = upsellService;
        responses.push({
          text: `Aproveite e adicione *${upsellService.name}* ao seu pedido?\n\n*1* - Sim, adicionar\n*2* - Não, continuar`,
        });
        return responses;
      }
    }

    session.stage = "ETAPA8_PHOTO";
    responses.push({
      text: "Você quer enviar uma foto do veículo agora? (opcional)\n\n*1* - Sim, enviar foto\n*2* - Não, seguir sem foto",
    });
  } else {
    responses.push({
      text: `Orçamento de R$ ${session.quote?.toFixed(2).replace(".", ",")}\n\nGostaria de continuar?\n*Sim* ou *Não*`,
    });
  }

  return responses;
}

async function handleUpsell(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  if (choice === "1" || choice.toLowerCase() === "sim") {
    if (session.upsellOffer) {
      const basePrice = session.upsellOffer.priceSuvMin || session.upsellOffer.priceHatchMin || 0;
      const upsellQuote = basePrice * (session.vehicle.condition === "ruim" ? 1.1 : 1.0);
      session.quote = (session.quote || 0) + upsellQuote;
      responses.push({
        text: `✅ Ótimo! ${session.upsellOffer.name} adicionado!\n\n💰 *Novo total: R$ ${session.quote.toFixed(2).replace(".", ",")}*`,
      });
    }
  }

  session.stage = "ETAPA8_PHOTO";
  responses.push({
    text: "Você quer enviar uma foto do veículo agora? (opcional)\n\n*1* - Sim, enviar foto\n*2* - Não, seguir sem foto",
  });

  return responses;
}

async function handleCouponStep(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim();
  const skip = /^(nao|não|n|sem|pular|ignorar)$/i.test(input);

  if (skip) {
    session.stage = "ETAPA10_BUDGET";
    responses.push({ text: "Sem cupom. Seguimos para o orçamento consolidado." });
    responses.push({
      text: buildBudgetSummaryText({
        serviceLabel: session.selectedServiceName || "Serviço premium",
        serviceValue: session.quote ?? 0,
        complementValue: 0,
        couponDiscount: 0,
        totalValue: session.quote ?? 0,
      }),
    });
    return responses;
  }

  const code = input.toLowerCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) {
    responses.push({ text: "Cupom inválido ou inativo. Se preferir, diga *não* e seguimos sem cupom." });
    return responses;
  }

  const baseQuote = Number(session.quote ?? 0);
  const couponAmount = Number(coupon.amount ?? 0);
  const discount = coupon.type === "percent" ? baseQuote * (couponAmount / 100) : couponAmount;
  const finalQuote = Math.max(0, baseQuote - discount);
  session.couponCode = coupon.code;
  session.couponDiscount = discount;
  session.quote = finalQuote;

  responses.push({
    text: `✅ Cupom *${coupon.code.toUpperCase()}* aplicado!\n\n${buildBudgetSummaryText({
      serviceLabel: session.selectedServiceName || "Serviço premium",
      serviceValue: baseQuote,
      complementValue: 0,
      couponDiscount: session.couponDiscount ?? 0,
      totalValue: finalQuote,
    })}`,
  });

  session.stage = "ETAPA10_BUDGET";
  responses.push({
    text: buildBudgetSummaryText({
      serviceLabel: session.selectedServiceName || "Serviço premium",
      serviceValue: baseQuote,
      complementValue: 0,
      couponDiscount: session.couponDiscount ?? 0,
      totalValue: finalQuote,
    }),
  });

  return responses;
}

async function handleDateSelection(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  let selectedDate = "";
  switch (choice) {
    case "1":
      selectedDate = new Date().toLocaleDateString("pt-BR");
      break;
    case "2":
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      selectedDate = tomorrow.toLocaleDateString("pt-BR");
      break;
    case "3":
      const in2Days = new Date();
      in2Days.setDate(in2Days.getDate() + 2);
      selectedDate = in2Days.toLocaleDateString("pt-BR");
      break;
    case "4":
      responses.push({ text: buildCalendarPrompt(new Date()) });
      return responses;
    default:
      responses.push({ text: buildCalendarPrompt(new Date()) });
      return responses;
  }

  session.stage = "ETAPA7_TIME";
  responses.push({
    text: `Que horário você prefere em ${selectedDate}?\n\n*1* - 08:00 - 10:00\n*2* - 10:00 - 12:00\n*3* - 14:00 - 16:00\n*4* - 16:00 - 18:00`,
  });

  return responses;
}

async function handleTimeSelection(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  const timeSlots: Record<string, string> = {
    "1": "08:00",
    "2": "10:00",
    "3": "14:00",
    "4": "16:00",
  };

  if (!timeSlots[choice]) {
    responses.push({ text: "❌ Horário inválido. Escolha 1, 2, 3 ou 4" });
    return responses;
  }

  session.stage = "ETAPA8_PAYMENT";
  responses.push({ text: buildPaymentOptionsText() });

  return responses;
}

async function handlePaymentSelection(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  const paymentMethods: Record<string, string> = {
    "1": "PIX",
    "2": "Cartão",
    "3": "Dinheiro",
  };

  if (!paymentMethods[choice]) {
    responses.push({ text: "❌ Forma de pagamento inválida" });
    return responses;
  }

  responses.push({
    text: `✅ Agendamento confirmado!\n\n📋 Resumo:\n- Cliente: ${session.customerName}\n- Serviço: ${session.selectedSubService}\n- Veículo: ${session.vehicle.model}\n- Valor: R$ ${session.quote?.toFixed(2).replace(".", ",")}\n- Pagamento: ${paymentMethods[choice]}\n\nObrigado por escolher nossos serviços! 🙏`,
  });

  session.stage = "ETAPA2_MAIN_MENU";
  return responses;
}

async function handleFAQ(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  // Simular resposta a perguntas frequentes
  const lowerMessage = message.toLowerCase();

  let answer = "";
  if (
    lowerMessage.includes("preço") ||
    lowerMessage.includes("valor") ||
    lowerMessage.includes("custa")
  ) {
    answer = "Os preços variam de acordo com o serviço e condição do veículo. Recomendo escolher o serviço para receber um orçamento personalizado!";
  } else if (
    lowerMessage.includes("tempo") ||
    lowerMessage.includes("quanto leva") ||
    lowerMessage.includes("demora")
  ) {
    answer = "O tempo varia de 30 minutos a 2 dias, dependendo do serviço escolhido.";
  } else if (
    lowerMessage.includes("garantia") ||
    lowerMessage.includes("qualidade")
  ) {
    answer = "Nós garantimos qualidade em todos os nossos serviços com profissionais certificados!";
  } else if (
    lowerMessage.includes("endereço") ||
    lowerMessage.includes("localização") ||
    lowerMessage.includes("onde")
  ) {
    answer = `📍 Estamos localizados em: ${settings?.businessAddress || "Rua Principal, 123"}`;
  } else {
    answer =
      "Desculpe, não tenho uma resposta para essa pergunta. Por favor, entre em contato com nosso atendimento para mais informações.";
  }

  responses.push({ text: answer });
  responses.push({
    text: `\nGostaria de agendar um serviço?\n\n*1* - Sim, mostrar menu\n*2* - Não, até logo!`,
  });

  return responses;
}
