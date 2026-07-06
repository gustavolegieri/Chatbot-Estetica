
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
  selectedDay?: string | null;
  selectedTime?: string | null;
  paymentMethod?: string | null;
  wantsReminder?: boolean | null;
  upsellAccepted?: boolean;
  upsellLabel?: string | null;
  upsellValue?: number | null;
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

  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **Seu orçamento**",
    `- Serviço: ${params.serviceLabel ?? "Serviço premium"} — **R$ ${serviceValue.toFixed(2).replace(".", ",")}**`,
  ];

  if (complementValue > 0) {
    lines.push(`- Complemento: **R$ ${complementValue.toFixed(2).replace(".", ",")}**`);
  }

  if (couponDiscount > 0) {
    lines.push(`- Desconto de cupom: **- R$ ${couponDiscount.toFixed(2).replace(".", ",")}**`);
  }

  lines.push(`- **Total: R$ ${totalValue.toFixed(2).replace(".", ",")}**`);
  lines.push("━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

export function buildPaymentOptionsText() {
  return [
    "**Forma de pagamento**",
    "",
    "*1* - 💳 PIX",
    "*2* - 💳 Cartão",
    "*3* - 💵 Dinheiro",
    "",
    "*(O valor não muda entre as formas de pagamento)*",
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

function calculateBasePrice(session: TestSession): number {
  const isSuv = isSuvLikeVehicle(session.vehicle.model ?? "");
  const isBad = session.vehicle.condition === "ruim";
  return isSuv ? (isBad ? 130 : 110) : (isBad ? 85 : 75);
}

function isSuvLikeVehicle(model: string | null): boolean {
  if (!model) return false;
  const t = model.toLowerCase();
  return /suv|pickup|picape|van|camionete|4x4|hilux|ranger|s10|toro|compass|renegade|t-cross|creta|hrv|sw4/i.test(t);
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

  if (message.trim().toLowerCase() === "menu") {
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

    case "ETAPA4_VEHICLE_CONFIRM":
      return handleVehicleConfirm(message, session, settings, catalog, prompts, responses);

    case "ETAPA6_UPSELL":
      return handleUpsell(message, session, settings, catalog, prompts, responses);

    case "ETAPA8_PHOTO":
      return handlePhotoStep(message, session, settings, catalog, prompts, responses);

    case "ETAPA9_COUPON":
      return handleCouponStep(message, session, settings, catalog, prompts, responses);

    case "ETAPA10_BUDGET":
      return handleBudgetResponse(message, session, settings, catalog, prompts, responses);

    case "ETAPA7_DAY":
      return handleDateSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA7_TIME":
      return handleTimeSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA8_PAYMENT":
      return handlePaymentSelection(message, session, settings, catalog, prompts, responses);

    case "ETAPA9_REMINDER":
      return handleReminderStep(message, session, settings, catalog, prompts, responses);

    case "ETAPA10_CONFIRM":
      return handleFinalConfirm(message, session, settings, catalog, prompts, responses);

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

  const description = serviceDetail(selectedService, prompts);
  responses.push({ text: description });

  const prismaMock = getPrismaForTest();

  const dbService = prismaMock?.service?.findFirst
    ? await prismaMock.service.findFirst({
        where: { catalogKey: selectedService.key },
        include: { media: true },
      })
    : await prisma.service.findFirst({
        where: { catalogKey: selectedService.key },
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
    text: `O que você gostaria de fazer?\n\n*1* - 📅 Quero agendar\n*2* - 🔄 Ver outros serviços\n*3* - 💬 Tenho uma dúvida`,
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
      session.stage = "ETAPA4_VEHICLE";
      responses.push({
        text: "🚘 Para começar, me conte sobre seu veículo em campos separados:\n\n📌 **Modelo:** (ex: Honda Civic)\n📅 **Ano:** (ex: 2020)\n🎨 **Cor:** (ex: Preto)\n🔧 **Estado de conservação:** (bom / regular / precisa de atenção especial)\n\nOu envie tudo junto, ex: *Honda Civic 2020, preto, em bom estado*",
      });
      break;

    case "2":
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
      session.stage = "ETAPA10_FAQ";
      responses.push({
        text: "Qual é sua dúvida? Vou tentar ajudar! 😊",
      });
      break;

    default:
      responses.push({ text: "❌ Opção inválida. Escolha 1, 2 ou 3" });
      responses.push({
        text: `O que você gostaria de fazer?\n\n*1* - 📅 Quero agendar\n*2* - 🔄 Ver outros serviços\n*3* - 💬 Tenho uma dúvida`,
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
  const vehicleInfo = parseVehicleMessage(message);

  const normalizedCondition = normalizeConditionValue(vehicleInfo.condition);

  session.vehicle = {
    model: vehicleInfo.model || session.vehicle.model,
    year: vehicleInfo.year ? parseInt(vehicleInfo.year) : session.vehicle.year,
    color: vehicleInfo.color || session.vehicle.color,
    condition: normalizedCondition !== "normal" ? normalizedCondition : session.vehicle.condition,
  };

  if (!session.vehicle.model || !session.vehicle.year || !session.vehicle.color || !session.vehicle.condition) {
    responses.push({ text: buildVehicleCollectionPrompt({
      model: session.vehicle.model || vehicleInfo.model || null,
      year: session.vehicle.year?.toString() ?? vehicleInfo.year ?? null,
      color: session.vehicle.color || vehicleInfo.color || null,
      condition: session.vehicle.condition || vehicleInfo.condition || null,
    }) });
    return responses;
  }

  session.stage = "ETAPA4_VEHICLE_CONFIRM";
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

async function handleVehicleConfirm(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|confirmo|confirma)$/i.test(input);
  const isNo = /^(nao|não|n|2|no|errado|alterar)$/i.test(input);

  if (isYes) {
    const basePrice = calculateBasePrice(session);
    session.quote = basePrice;

    let hasUpsell = false;
    try {
      const { dbService } = await resolveTestService(session);
      if (dbService?.upsellServiceId) {
        const prismaMock = getPrismaForTest();
        const upsellService = prismaMock?.service?.findUnique
          ? await prismaMock.service.findUnique({ where: { id: dbService.upsellServiceId } })
          : await prisma.service.findUnique({ where: { id: dbService.upsellServiceId } });

        if (upsellService) {
          session.stage = "ETAPA6_UPSELL";
          session.upsellOffer = upsellService;
          const upsellPrice = upsellService.priceSuvMin || upsellService.priceHatchMin || 0;
          responses.push({
            text: `✨ Que tal adicionar *${upsellService.name}* ao seu agendamento?\n\n💰 Valor adicional: **R$ ${upsellPrice.toFixed(2).replace(".", ",")}**\n\n*1* - Sim, quero incluir\n*2* - Não, seguir só com o serviço escolhido`,
          });
          hasUpsell = true;
          return responses;
        }
      }
    } catch {
      // Sem upsell no DB
    }

    if (!hasUpsell) {
      session.stage = "ETAPA8_PHOTO";
      responses.push({
        text: "Você quer enviar uma foto do veículo agora? (opcional, ajuda a equipe a se preparar melhor)\n\n*1* - Sim, vou enviar\n*2* - Não, pular esta etapa",
      });
    }
    return responses;
  }

  if (isNo) {
    session.stage = "ETAPA4_VEHICLE";
    responses.push({
      text: "Sem problemas! Vamos corrigir. Me diga novamente os dados do veículo.\n\nEx: *Honda Civic 2020, preto, em bom estado*",
    });
    return responses;
  }

  responses.push({
    text: "❔ Não entendi. Confirma os dados do veículo? (sim/não)",
  });
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
      session.upsellAccepted = true;
      session.upsellLabel = session.upsellOffer.name;
      session.upsellValue = upsellQuote;
      responses.push({
        text: `✅ Ótimo! *${session.upsellOffer.name}* adicionado ao seu agendamento!`,
      });
    }
  } else {
    responses.push({
      text: "Sem problemas! Vamos seguir com o serviço escolhido 😊",
    });
  }

  session.stage = "ETAPA8_PHOTO";
  responses.push({
    text: "Você quer enviar uma foto do veículo agora? (opcional, ajuda a equipe a se preparar melhor)\n\n*1* - Sim, vou enviar\n*2* - Não, pular esta etapa",
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
      ? "Foto registrada como opcional. 📸"
      : "Sem foto anexada. Seguimos! 👍",
  });
  responses.push({
    text: "Você tem algum cupom de desconto? 🎟️ Me envie o código, ou responda *não* se não tiver.",
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
  const skip = /^(nao|não|n|sem|pular|ignorar|nenhum)$/i.test(input);

  const baseQuote = Number(session.quote ?? calculateBasePrice(session));
  const complementValue = Number(session.upsellValue ?? 0);

  if (skip) {
    session.stage = "ETAPA10_BUDGET";
    responses.push({
      text: buildBudgetSummaryText({
        serviceLabel: session.selectedServiceName || "Serviço premium",
        serviceValue: baseQuote,
        complementValue,
        couponDiscount: 0,
        totalValue: baseQuote + complementValue,
      }),
    });
    responses.push({
      text: "Deseja prosseguir com o agendamento? (sim/não)",
    });
    return responses;
  }

  const code = input.toLowerCase();
  let coupon = null;
  try {
    const prismaMock = getPrismaForTest();
    coupon = prismaMock?.coupon?.findUnique
      ? await prismaMock.coupon.findUnique({ where: { code } })
      : await prisma.coupon.findUnique({ where: { code } });
  } catch {
    // Se falhar, segue sem cupom
  }

  if (!coupon || !coupon.active) {
    responses.push({ text: "Cupom inválido ou inativo 🎟️ Se preferir, diga *não* e seguimos sem cupom." });
    return responses;
  }

  const couponAmount = Number(coupon.amount ?? 0);
  const discount = coupon.type === "percent" ? baseQuote * (couponAmount / 100) : couponAmount;
  const finalQuote = Math.max(0, baseQuote + complementValue - discount);
  session.couponCode = coupon.code;
  session.couponDiscount = discount;

  responses.push({
    text: `✅ Cupom *${coupon.code.toUpperCase()}* aplicado! Desconto de **R$ ${discount.toFixed(2).replace(".", ",")}**`,
  });

  session.stage = "ETAPA10_BUDGET";
  responses.push({
    text: buildBudgetSummaryText({
      serviceLabel: session.selectedServiceName || "Serviço premium",
      serviceValue: baseQuote,
      complementValue,
      couponDiscount: discount,
      totalValue: finalQuote,
    }),
  });
  responses.push({
    text: "Deseja prosseguir com o agendamento? (sim/não)",
  });

  return responses;
}

async function handleBudgetResponse(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|quero|agendar|confirmo)$/i.test(input);

  if (isYes) {
    session.stage = "ETAPA7_DAY";
    responses.push({
      text: buildCalendarPrompt(new Date()),
    });
    return responses;
  }

  responses.push({
    text: "Sem problemas! 😊 Se mudar de ideia, é só chamar. Quer ver outros serviços? (sim/não)",
  });
  session.stage = "ETAPA2_MAIN_MENU";
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
  const input = message.trim().toLowerCase();

  if (input === "hoje") {
    const today = new Date();
    if (today.getDay() === 0) {
      responses.push({
        text: "❌ Hoje é domingo e estamos fechados! Por favor, escolha outro dia.\n\n" + buildCalendarPrompt(new Date()),
      });
      return responses;
    }
    session.selectedDay = today.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({
      text: `📅 *Hoje (${today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}))*\n\nQue horário você prefere?\n\n*1* - 08:00 às 10:00\n*2* - 10:00 às 12:00\n*3* - 14:00 às 16:00\n*4* - 16:00 às 18:00`,
    });
    return responses;
  }

  if (input === "amanhã" || input === "amanha") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) {
      responses.push({
        text: "❌ Amanhã é domingo e estamos fechados! Por favor, escolha outro dia.\n\n" + buildCalendarPrompt(new Date()),
      });
      return responses;
    }
    session.selectedDay = tomorrow.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({
      text: `📅 *Amanhã (${tomorrow.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}))*\n\nQue horário você prefere?\n\n*1* - 08:00 às 10:00\n*2* - 10:00 às 12:00\n*3* - 14:00 às 16:00\n*4* - 16:00 às 18:00`,
    });
    return responses;
  }

  const dayNum = parseInt(input);
  if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    if (dayNum > daysInMonth) {
      responses.push({
        text: `❌ O mês atual só tem ${daysInMonth} dias. Por favor, escolha um dia válido.\n\n` + buildCalendarPrompt(new Date()),
      });
      return responses;
    }

    if (dayNum < today.getDate()) {
      responses.push({
        text: `❌ Esse dia já passou! Por favor, escolha um dia futuro.\n\n` + buildCalendarPrompt(new Date()),
      });
      return responses;
    }

    const selectedDate = new Date(year, month, dayNum);
    if (selectedDate.getDay() === 0) {
      responses.push({
        text: "❌ Este dia é domingo e estamos fechados! Por favor, escolha outro dia.\n\n" + buildCalendarPrompt(new Date()),
      });
      return responses;
    }

    session.selectedDay = selectedDate.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({
      text: `📅 *${selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}*\n\n⏰ Horários disponíveis:\n\n*1* - 08:00 às 10:00\n*2* - 10:00 às 12:00\n*3* - 14:00 às 16:00\n*4* - 16:00 às 18:00`,
    });
    return responses;
  }

  const dateMatch = input.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    let year = parseInt(dateMatch[3] ?? String(new Date().getFullYear()));
    if (dateMatch[3]?.length === 2) year += 2000;

    const selectedDate = new Date(year, month, day);
    const today = new Date();

    if (selectedDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      responses.push({
        text: "❌ Essa data já passou! Por favor, escolha uma data futura.\n\n" + buildCalendarPrompt(new Date()),
      });
      return responses;
    }

    if (selectedDate.getDay() === 0) {
      responses.push({
        text: "❌ Este dia é domingo e estamos fechados! Por favor, escolha outro dia.\n\n" + buildCalendarPrompt(new Date()),
      });
      return responses;
    }

    session.selectedDay = selectedDate.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({
      text: `📅 *${selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}*\n\n⏰ Horários disponíveis:\n\n*1* - 08:00 às 10:00\n*2* - 10:00 às 12:00\n*3* - 14:00 às 16:00\n*4* - 16:00 às 18:00`,
    });
    return responses;
  }

  responses.push({
    text: "❌ Não entendi a data. Por favor, escolha um dia do calendário abaixo:\n\n" + buildCalendarPrompt(new Date()),
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

  const timeSlots: Record<string, { start: string; end: string }> = {
    "1": { start: "08:00", end: "10:00" },
    "2": { start: "10:00", end: "12:00" },
    "3": { start: "14:00", end: "16:00" },
    "4": { start: "16:00", end: "18:00" },
  };

  if (!timeSlots[choice]) {
    responses.push({ text: "❌ Horário inválido. Escolha 1, 2, 3 ou 4" });
    return responses;
  }

  const slot = timeSlots[choice];
  session.selectedTime = `${slot.start} às ${slot.end}`;
  session.stage = "ETAPA8_PAYMENT";

  responses.push({ text: `⏰ *${slot.start} às ${slot.end}* — ótimo horário! 😊\n\nAgora vamos definir o pagamento.` });
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
    responses.push({ text: "❌ Forma de pagamento inválida. Escolha 1 (PIX), 2 (Cartão) ou 3 (Dinheiro)" });
    return responses;
  }

  session.paymentMethod = paymentMethods[choice];
  session.stage = "ETAPA9_REMINDER";

  responses.push({
    text: `💳 Pagamento: *${paymentMethods[choice]}*\n\nGostaria de receber um lembrete no WhatsApp 1 hora antes do horário agendado?\n\n*1* - Sim, quero lembrete\n*2* - Não precisa`,
  });

  return responses;
}

async function handleReminderStep(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const wantsReminder = /^(1|sim|s|quero|yes)$/i.test(input);

  session.wantsReminder = wantsReminder;
  session.stage = "ETAPA10_CONFIRM";

  const baseQuote = Number(session.quote ?? calculateBasePrice(session));
  const complementValue = Number(session.upsellValue ?? 0);
  const couponDiscount = Number(session.couponDiscount ?? 0);
  const totalValue = Math.max(0, baseQuote + complementValue - couponDiscount);

  const reminderLine = wantsReminder ? "✅ Sim" : "❌ Não";
  const dateStr = session.selectedDay ?? "—";
  const timeStr = session.selectedTime ?? "—";
  const vehicleStr = session.vehicle.model
    ? `${session.vehicle.model} ${session.vehicle.year ?? ""}, ${session.vehicle.color ?? ""}, ${session.vehicle.condition ?? ""}`
    : "—";

  responses.push({
    text: [
      "━━━━━━━━━━━━━━━",
      "📋 **RESUMO DO AGENDAMENTO**",
      `👤 Cliente: *${session.customerName ?? "—"}*`,
      `🧽 Serviço: *${session.selectedServiceName ?? "—"}*${session.upsellLabel ? ` + *${session.upsellLabel}*` : ""}`,
      `🚘 Veículo: *${vehicleStr}*`,
      `📅 Data: *${dateStr}*`,
      `⏰ Horário: *${timeStr}*`,
      `🎟️ Cupom: *${session.couponCode?.toUpperCase() ?? "nenhum"}*`,
      `💳 Pagamento: *${session.paymentMethod ?? "—"}*`,
      `🔔 Lembrete: *${reminderLine}*`,
      `💰 Valor total: **R$ ${totalValue.toFixed(2).replace(".", ",")}**`,
      "━━━━━━━━━━━━━━━",
      "",
      "Confirma o agendamento? (sim/não)",
      "",
      "📌 *Política de cancelamento:* cancelamentos com até **2h de antecedência** não têm custo.",
    ].join("\n"),
  });

  return responses;
}

async function handleFinalConfirm(
  message: string,
  session: TestSession,
  settings: any,
  catalog: any[],
  prompts: PromptMap,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|confirmo|agendar)$/i.test(input);
  const isNo = /^(nao|não|n|2|no|alterar|cancelar)$/i.test(input);

  if (isYes) {
    const dateStr = session.selectedDay ?? "hoje";
    const timeStr = session.selectedTime ?? "—";
    const baseQuote = Number(session.quote ?? calculateBasePrice(session));
    const complementValue = Number(session.upsellValue ?? 0);
    const couponDiscount = Number(session.couponDiscount ?? 0);
    const totalValue = Math.max(0, baseQuote + complementValue - couponDiscount);

    responses.push({
      text: [
        "✅ **Agendamento confirmado!** 🎉",
        "",
        `Seu horário na *Garagem do Ka* está garantido para *${dateStr}* às *${timeStr}*.`,
        "",
        `📍 **Endereço:** ${settings?.businessAddress || "Rua das Oficinas, 100 - São Paulo, SP"}`,
        `🕐 **Funcionamento:** Segunda a sábado, 08:00 às 18:00`,
        "",
        `📌 *Cancelamentos com até 2h de antecedência não têm custo.*`,
        "",
        "Posso te ajudar com mais alguma coisa? 😊",
      ].join("\n"),
    });

    session.stage = "ETAPA2_MAIN_MENU";
    return responses;
  }

  if (isNo) {
    responses.push({
      text: "Sem problemas! 😊 O que você gostaria de alterar?\n\n*1* - Alterar data/horário\n*2* - Alterar serviço\n*3* - Alterar forma de pagamento\n*4* - Cancelar e voltar ao menu",
    });

    const alterChoice = message.trim();
    if (alterChoice === "1") {
      session.stage = "ETAPA7_DAY";
      responses.push({
        text: "📅 Qual a nova data?\n\n" + buildCalendarPrompt(new Date()),
      });
    } else if (alterChoice === "2") {
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const menuText = etapa2MainMenu(
        session.customerName || "Cliente",
        buildMainMenu(wctx.categories, prompts),
        prompts
      );
      responses.push({ text: menuText });
    } else if (alterChoice === "3") {
      session.stage = "ETAPA8_PAYMENT";
      responses.push({ text: buildPaymentOptionsText() });
    } else {
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const menuText = etapa2MainMenu(
        session.customerName || "Cliente",
        buildMainMenu(wctx.categories, prompts),
        prompts
      );
      responses.push({ text: menuText });
    }
    return responses;
  }

  responses.push({
    text: "❔ Não entendi. Confirma o agendamento? (sim/não)",
  });
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
    answer = "🛡️ Nós garantimos qualidade em todos os nossos serviços com profissionais certificados!";
  } else if (
    lowerMessage.includes("endereço") ||
    lowerMessage.includes("localização") ||
    lowerMessage.includes("onde")
  ) {
    answer = `📍 Estamos localizados em: ${settings?.businessAddress || "Rua das Oficinas, 100 - São Paulo, SP"}`;
  } else if (lowerMessage === "voltar") {
    session.stage = "ETAPA3_SERVICE_ACTION";
    responses.push({
      text: `O que você gostaria de fazer?\n\n*1* - 📅 Quero agendar\n*2* - 🔄 Ver outros serviços\n*3* - 💬 Tenho uma dúvida`,
    });
    return responses;
  } else {
    answer = "Desculpe, não tenho uma resposta para essa pergunta. Por favor, entre em contato com nosso atendimento para mais informações.";
  }

  responses.push({ text: answer });
  responses.push({
    text: `\nGostaria de agendar um serviço?\n\n*1* - Sim, mostrar menu\n*2* - Não, até logo!`,
  });

  return responses;
}
