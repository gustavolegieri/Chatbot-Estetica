import { FlowState } from "./whatsapp-flow-types";
import { renderPrompt, loadPromptMap, type PromptMap } from "./bot-prompts";
import { parseVehicleMessage, type ParsedVehicle } from "./whatsapp-vehicle-parse";
import { prisma } from "./prisma";
import { buildMainMenu, loadWhatsAppCatalog } from "./whatsapp-service-catalog";
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
  const normalized = (value || "").toLowerCase().trim();

  if (!normalized) return "normal";
  if (/(excelente|novo|zero km|seminovo|otimo|ótimo)/.test(normalized)) return "excelente";
  if (/(bom|bom estado|pouco uso|bem|limpo)/.test(normalized)) return "bom";
  if (/(ruim|arranh|feio|sujei|muito sujo|mancha|oxida|opac|precisa de atenção|precisa de atencao|gasto|precisa)/.test(normalized)) {
    return "ruim";
  }

  return "normal";
}

async function resolveTestService(session: TestSession) {
  const where = buildTestServiceLookupWhere(session.selectedSubService, session.selectedServiceName);
  const dbService = await prisma.service.findFirst({
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

  // Verificar intenção de "menu"
  if (message.toLowerCase() === "menu") {
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

  if (name.length < 2) {
    responses.push({ text: "Por favor, digite um nome válido (mínimo 2 caracteres)" });
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
  const dbService = await prisma.service.findFirst({
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

  const { dbService, catalogItem } = await resolveTestService(session);

  // Calcular cotação usando o banco quando existir, ou o catálogo como fallback
  const isSUV = vehicleInfo.isSuv || false;
  const basePrice = dbService
    ? (isSUV ? Number(dbService.priceSuvMin || 0) : Number(dbService.priceHatchMin || 0))
    : catalogItem
      ? (isSUV ? Number(catalogItem.suvMin || 0) : Number(catalogItem.hatchMin || 0))
      : 0;

  const conditionMultiplier: Record<string, number> = {
    excelente: 0.95,
    bom: 0.95,
    normal: 1.0,
    ruim: 1.1,
  };

  const multiplier = conditionMultiplier[normalizedCondition] ?? 1.0;
  const quote = basePrice * multiplier;

  session.quote = quote;
  session.stage = "ETAPA5_QUOTE";

  const vehicleStr = `${vehicleInfo.model || "veículo"} ${vehicleInfo.year || ""}`.trim();
  responses.push({
    text: `Ótimo! Para ${vehicleStr} em estado ${vehicleInfo.condition || "normal"}:\n\n💰 *Orçamento: R$ ${quote.toFixed(2).replace(".", ",")}*\n\nProsseguir com agendamento?`,
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
    // Verificar upsell
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

    // Sem upsell, ir para data
    session.stage = "ETAPA7_DAY";
    responses.push({
      text: `Que dia você prefere?\n\n*1* - Hoje\n*2* - Amanhã\n*3* - Em 2 dias\n*4* - Outra data`,
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

  session.stage = "ETAPA7_DAY";
  responses.push({
    text: `Que dia você prefere?\n\n*1* - Hoje\n*2* - Amanhã\n*3* - Em 2 dias\n*4* - Outra data`,
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
      responses.push({ text: "Digite a data desejada (formato: DD/MM/YYYY)" });
      return responses;
    default:
      responses.push({ text: "❌ Opção inválida. Escolha 1, 2, 3 ou 4" });
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
  responses.push({
    text: `Como você gostaria de pagar?\n\n*1* - PIX (5% desconto) 💳\n*2* - Cartão\n*3* - Dinheiro`,
  });

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
