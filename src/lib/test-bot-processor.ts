// Test bot processor - fluxo idêntico ao WhatsApp flow
// Usa as MESMAS funções de validação, parsing e formatação do whatsapp-flow.ts
// para garantir comportamento idêntico entre teste e produção

import type { FlowState } from "./whatsapp-flow-types";
import {
  isValidCustomerName,
  normalizeVehicleConditionValue,
  buildVehicleCollectionPrompt,
  buildVehicleConfirmationPrompt,
  buildCalendarPrompt,
} from "./flow-validation";
import {
  etapa1Welcome,
  etapa2MainMenu,
  serviceDetail,
  formatHours,
} from "./whatsapp-flow-messages";
import { loadPromptMap } from "./bot-prompts";
import { parseVehicleMessage } from "./whatsapp-vehicle-parse";
import { loadWhatsAppCatalog } from "./whatsapp-service-catalog";

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
  vehiclePhotoUrl?: string | null;
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
  // Novos campos
  isReturningClient?: boolean;
  savedVehicle?: string | null;
  loyaltyPoints?: number;
  wantsPickupDelivery?: boolean | null;
  pickupDeliveryFee?: number;
  awaitingPhotoUpload?: boolean;
}

interface TestResponse {
  text: string;
  mediaUrl?: string;
  mediaType?: string;
}

export async function processTestFlow({
  sessionId,
  message,
  session,
}: {
  sessionId: string;
  message: string;
  session: TestSession;
}): Promise<TestResponse[]> {
  const responses: TestResponse[] = [];
  const prompts = await loadPromptMap();

  // 🚫 Handoff request detection (shared with WhatsApp flow)
  if (/falar com (o )?(dono|atendente|humano|pessoa)|atendimento humano|humano por favor|quero um atendente/i.test(message)) {
    responses.push({ text: "Entendi 😊 Vou encaminhar sua solicitação para a equipe da Garagem do Ka. Enquanto isso, pode continuar descrevendo sua dúvida." });
    return responses;
  }

  // 🔄 Menu command
  if (message.trim().toLowerCase() === "menu") {
    const wctx = await loadWhatsAppCatalog(true);
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
      return handleNameCollection(message, session, prompts, responses, sessionId);

    case "ETAPA2_CLIENT_RECOGNITION":
      return handleClientRecognition(message, session, prompts, responses);

    case "ETAPA2_MAIN_MENU":
      return handleMainMenu(message, session, prompts, responses);

    case "ETAPA2_SUB":
      return handleSubMenu(message, session, prompts, responses);

    case "ETAPA3_SERVICE_ACTION":
      return handleServiceAction(message, session, prompts, responses);

    case "ETAPA4_VEHICLE":
      return handleVehicleStage(message, session, responses);

    case "ETAPA5_QUOTE":
      return handleQuoteStep(message, session, responses);

    case "ETAPA6_UPSELL":
      return handleUpsell(message, session, responses);

    case "ETAPA8_PHOTO_UPLOAD":
      return handlePhotoUpload(message, session, responses);

    case "ETAPA9_COUPON":
      return handleCouponStep(message, session, responses);

    case "ETAPA9_LOYALTY":
      return handleLoyaltyStep(message, session, responses);

    case "ETAPA10_BUDGET":
      return handleBudgetResponse(message, session, responses);

    case "ETAPA10_LOGISTICS":
      return handleLogistics(message, session, responses);

    case "ETAPA7_DAY":
      return handleDateSelection(message, session, responses);

    case "ETAPA7_TIME":
      return handleTimeSelection(message, session, responses);

    case "ETAPA9_REMINDER":
      return handleReminderStep(message, session, responses);

    case "ETAPA8_PAYMENT":
      return handlePaymentSelection(message, session, responses);

    case "ETAPA10_CONFIRM":
      return handleFinalConfirm(message, session, responses);

    case "ETAPA10_FAQ":
      return handleFAQ(message, session, responses);

    default:
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

// Helper
const buildMainMenu = (categories: Record<number, { title: string; keys: string[] }>, _prompts: any) => {
  const MAIN_EMOJIS: Record<number, string> = {
    1: "💧",
    2: "✨",
    3: "🛡️",
    4: "🪑",
    5: "🔬",
    6: "🔄",
    7: "📦",
    8: "🤔",
  };
  if (!categories || Object.keys(categories).length === 0) return "Menu não configurado";
  return Object.entries(categories)
    .map(([num, cat]) => `*${num}* - ${MAIN_EMOJIS[Number(num)] ?? "•"} ${cat.title}`)
    .join("\n");
};

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

function normalizeConditionValue(value: string): "excelente" | "bom" | "normal" | "ruim" {
  const normalized = normalizeVehicleConditionValue(value);
  if (normalized === "excelente") return "excelente";
  if (normalized === "bom") return "bom";
  if (normalized === "precisa de atenção") return "ruim";
  return "normal";
}

function buildBudgetSummaryText(params: {
  serviceLabel?: string | null;
  serviceValue?: number | null;
  complementValue?: number | null;
  couponDiscount?: number | null;
  loyaltyDiscount?: number | null;
  totalValue?: number | null;
}) {
  const serviceValue = Number(params.serviceValue ?? 0);
  const complementValue = Number(params.complementValue ?? 0);
  const couponDiscount = Number(params.couponDiscount ?? 0);
  const loyaltyDiscount = Number(params.loyaltyDiscount ?? 0);
  const totalValue = Number(params.totalValue ?? serviceValue + complementValue - couponDiscount - loyaltyDiscount);

  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **Seu orçamento**",
    `- Serviço: ${params.serviceLabel ?? "Serviço premium"} — **R$ ${serviceValue.toFixed(2).replace(".", ",")}**`,
  ];

  if (complementValue > 0) {
    lines.push(`- Proteção: **R$ ${complementValue.toFixed(2).replace(".", ",")}**`);
  }

  if (loyaltyDiscount > 0) {
    lines.push(`- Pontos (desconto): **- R$ ${loyaltyDiscount.toFixed(2).replace(".", ",")}**`);
  }

  if (couponDiscount > 0) {
    lines.push(`- Cupom: **- R$ ${couponDiscount.toFixed(2).replace(".", ",")}**`);
  }

  lines.push(`- **Total: R$ ${totalValue.toFixed(2).replace(".", ",")}**`);
  lines.push("━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

// Handlers
async function handleNameCollection(
  message: string,
  session: TestSession,
  prompts: any,
  responses: TestResponse[],
  sessionId: string
): Promise<TestResponse[]> {
  const name = message.trim().slice(0, 50);

  if (!isValidCustomerName(name)) {
    responses.push({ text: "Não consegui identificar seu nome 😊 Pode me dizer como posso te chamar?" });
    return responses;
  }

  session.customerName = name;

  // Simular cliente recorrente (para teste)
  if (sessionId.includes("returning")) {
    session.isReturningClient = true;
    session.savedVehicle = "Honda Civic 2020";
    session.loyaltyPoints = 120;
    session.stage = "ETAPA2_CLIENT_RECOGNITION";
    responses.push({ text: `Que bom te ver de novo, ${name}! 👋\n\nÚltima vez foi *Lavagem Detalhada* no seu *Honda Civic 2020*. Quer repetir?` });
    return responses;
  }

  session.stage = "ETAPA2_MAIN_MENU";
  const wctx = await loadWhatsAppCatalog(true);
  const menuText = etapa2MainMenu(name, buildMainMenu(wctx.categories, prompts), prompts);
  responses.push({ text: menuText });
  return responses;
}

async function handleClientRecognition(
  message: string,
  session: TestSession,
  prompts: any,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const wantsRepeat = /^(sim|s|1)$/i.test(input);

  if (wantsRepeat && session.savedVehicle) {
    // Auto-usar veículo salvo
    session.vehicle = {
      model: "Honda Civic",
      year: 2020,
      color: "preto",
      condition: "bom",
    };
    session.stage = "ETAPA4_VEHICLE_CONFIRM";
    responses.push({ text: buildVehicleConfirmationPrompt({ model: "Honda Civic", year: "2020", color: "preto", condition: "bom" }) });
    return responses;
  }

  session.stage = "ETAPA2_MAIN_MENU";
  const wctx = await loadWhatsAppCatalog(true);
  responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
  return responses;
}

async function handleMainMenu(
  message: string,
  session: TestSession,
  prompts: any,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  if (!/^[1-8]$/.test(choice)) {
    responses.push({ text: "❌ Escolha inválida. Selecione uma opção de 1 a 8." });
    const wctx = await loadWhatsAppCatalog(true);
    const menuText = etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts);
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
    responses.push({ text: "Desculpe, nenhuma opção disponível nessa categoria." });
    session.stage = "ETAPA2_MAIN_MENU";
    const menuText = etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts);
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
  prompts: any,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = parseInt(message.trim());

  const wctx = await loadWhatsAppCatalog(true);
  const categoryServices = Object.values(wctx.catalog).filter((s: any) =>
    s.key.toLowerCase().includes(session.selectedService)
  );

  if (isNaN(choice) || choice < 1 || choice > categoryServices.length) {
    responses.push({ text: `❌ Opção inválida. Escolha entre 1 e ${categoryServices.length}.` });
    return responses;
  }

  const selectedService = categoryServices[choice - 1];
  session.selectedSubService = selectedService.key;
  session.selectedServiceName = selectedService.label;

  const description = serviceDetail(selectedService, prompts);
  responses.push({ text: description });

  session.stage = "ETAPA3_SERVICE_ACTION";
  responses.push({
    text: "Como deseja prosseguir?\n\n*1* 📅 Agendar agora\n*2* 🔄 Ver outros\n*3* 💬 Tenho dúvidas",
  });

  return responses;
}

async function handleServiceAction(
  message: string,
  session: TestSession,
  prompts: any,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  switch (choice) {
    case "1":
      session.stage = "ETAPA4_VEHICLE";
      responses.push({
        text: "🚘 Me diga os dados do veículo para continuar.\n\nModelo, ano, cor e estado.",
      });
      break;

    case "2":
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
      break;

    case "3":
      session.stage = "ETAPA10_FAQ";
      responses.push({ text: "📝 Qual sua dúvida? Vou ajudar! " });
      break;

    default:
      responses.push({ text: "❌ Escolha 1, 2 ou 3." });
  }

  return responses;
}

async function handleVehicleStage(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|confirmo|confirma|tudo certo)$/i.test(input);
  const isNo = /^(nao|não|n|2|no|errado|alterar|tudo errado|nada certo)$/i.test(input);

  if (isYes) {
    const basePrice = calculateBasePrice(session);
    session.quote = basePrice;
    session.stage = "ETAPA5_QUOTE";
    responses.push({
      text: buildBudgetSummaryText({
        serviceLabel: session.selectedServiceName || "Serviço premium",
        serviceValue: basePrice,
        complementValue: session.upsellValue ?? 0,
        couponDiscount: session.couponDiscount ?? 0,
        totalValue: basePrice + (session.upsellValue ?? 0) - (session.couponDiscount ?? 0),
      }),
    });
    responses.push({ text: "Quer agendar? (sim/não) " });
    return responses;
  }

  if (isNo) {
    session.stage = "ETAPA4_VEHICLE";
    responses.push({ text: "Sem problemas! Me informe os dados corretos. " });
    return responses;
  }

  // Resposta "mesmo veículo" para cliente recorrente
  if (/^(mesmo|mesmo veiculo|sim|1)$/i.test(input) && session.savedVehicle) {
    session.vehicle = { model: "Honda Civic", year: 2020, color: "preto", condition: "bom" };
    responses.push({ text: buildVehicleConfirmationPrompt({ model: "Honda Civic", year: "2020", color: "preto", condition: "bom" }) });
    return responses;
  }

  const vehicleInfo = parseVehicleMessage(message);
  const normalizedCondition = normalizeConditionValue(vehicleInfo.condition);

  session.vehicle = {
    model: vehicleInfo.model || session.vehicle.model,
    year: vehicleInfo.year ? parseInt(vehicleInfo.year) : session.vehicle.year,
    color: vehicleInfo.color || session.vehicle.color,
    condition: normalizedCondition || session.vehicle.condition,
  };

  // Verifica se tem todos os campos necessários
  const missing: string[] = [];
  if (!session.vehicle.model) missing.push("modelo");
  if (!session.vehicle.year) missing.push("ano");
  if (!session.vehicle.color) missing.push("cor");

  if (missing.length > 0) {
    responses.push({
      text: `📝 Faltam: ${missing.join(", ")}. Me informe para completar.\n\nEx: "Honda Civic 2020, preto"`,
    });
    return responses;
  }

  responses.push({ text: buildVehicleConfirmationPrompt({
    model: session.vehicle.model,
    year: session.vehicle.year?.toString() ?? "",
    color: session.vehicle.color,
    condition: session.vehicle.condition,
  }) });
  return responses;
}

async function handleQuoteStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|quero|agendar|confirmo)$/i.test(input);

  if (!isYes) {
    responses.push({ text: "Sem problemas! Voltar ao menu? (sim/não) " });
    session.stage = "ETAPA2_MAIN_MENU";
    return responses;
  }

  session.stage = "ETAPA6_UPSELL";
  responses.push({
    text: "✨ Que tal adicionar *Proteção de Pintura Vitrificada*?\n\n💰 **R$ 85,00** a mais\n\n*1* - Sim, incluir\n*2* - Não, obrigado",
  });
  return responses;
}

async function handleUpsell(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();

  if (choice === "1" || choice.toLowerCase() === "sim") {
    session.upsellAccepted = true;
    session.upsellLabel = "Proteção de Pintura Vitrificada";
    session.upsellValue = 85;
    responses.push({ text: "✅ Incluído! " });
  } else {
    responses.push({ text: "Tudo bem! " });
  }

  session.stage = "ETAPA7_DAY";
  responses.push({ text: buildCalendarPrompt(new Date()) });
  return responses;
}

async function handleCouponStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim();
  const skip = /^(nao|não|n|sem|pular|ignorar|nenhum)$/i.test(input);

  if (skip) {
    // Ir para pontos de fidelidade se houver
    if (session.loyaltyPoints && session.loyaltyPoints > 0) {
      session.stage = "ETAPA9_LOYALTY";
      responses.push({ text: `🌟 Você tem ${session.loyaltyPoints} pontos! Troca por 10% de desconto?\n\n*1* - Sim\n*2* - Não ` });
      return responses;
    }
    session.stage = "ETAPA10_BUDGET";
    return handleShowBudget(session, responses);
  }

  responses.push({ text: "🎟️ Cupom inválido. Se preferir, diga *não*. " });
  return responses;
}

async function handleLoyaltyStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const usePoints = /^(sim|s|1)$/i.test(input);

  if (usePoints && session.loyaltyPoints && session.loyaltyPoints > 0) {
    session.loyaltyPoints = 0;
    responses.push({ text: "🌟 Desconto aplicado! " });
  } else {
    responses.push({ text: "Sem problemas! " });
  }

  session.stage = "ETAPA10_BUDGET";
  return handleShowBudget(session, responses);
}

function handleShowBudget(session: TestSession, responses: TestResponse[]): TestResponse[] {
  const baseQuote = Number(session.quote ?? calculateBasePrice(session));
  const complementValue = Number(session.upsellValue ?? 0);
  const couponDiscount = Number(session.couponDiscount ?? 0);
  const loyaltyDiscount = session.loyaltyPoints && session.loyaltyPoints >= 100 ? 10 : 0;

  responses.push({
    text: buildBudgetSummaryText({
      serviceLabel: session.selectedServiceName || "Serviço premium",
      serviceValue: baseQuote,
      complementValue,
      couponDiscount,
      loyaltyDiscount: session.loyaltyPoints ? (session.quote ?? calculateBasePrice(session)) * (loyaltyDiscount / 100) : 0,
      totalValue: baseQuote + complementValue - couponDiscount,
    }),
  });
  responses.push({ text: "Quer agendar? (sim/não) " });
  return responses;
}

async function handleBudgetResponse(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|quero|agendar|confirmo)$/i.test(input);

  if (isYes) {
    session.stage = "ETAPA10_LOGISTICS";
    responses.push({
      text: "🚚 Como prefere?\n\n*1* - Buscar na loja\n*2* - Busca/entrega (+R$30)",
    });
    return responses;
  }

  responses.push({ text: "Sem problemas! Voltar ao menu? (sim/não) " });
  session.stage = "ETAPA2_MAIN_MENU";
  return responses;
}

async function handleLogistics(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const wantsDelivery = /^(2|busca|entrega|sim|s)$/i.test(input);

  session.wantsPickupDelivery = wantsDelivery;
  session.pickupDeliveryFee = wantsDelivery ? 30 : 0;
  session.stage = "ETAPA7_DAY";

  responses.push({ text: wantsDelivery ? "🚚 Taxa de R$30 incluída no total!" : "📍 Combinado, traga quando puder!" });
  responses.push({ text: buildCalendarPrompt(new Date()) });
  return responses;
}

async function handleDateSelection(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();

  if (input === "hoje") {
    const today = new Date();
    if (today.getDay() === 0) {
      responses.push({ text: "❌ Domingo fechamos. " });
      return responses;
    }
    session.selectedDay = today.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({ text: `📅 *Hoje* (${today.toLocaleDateString("pt-BR")})\n\n⏰ Qual horário?\n\n*1* - 08:00\n*2* - 10:00\n*3* - 14:00\n*4* - 16:00 ` });
    return responses;
  }

  const dayNum = parseInt(input);
  if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
    const today = new Date();
    const selectedDate = new Date(today.getFullYear(), today.getMonth(), dayNum);
    if (selectedDate.getDay() === 0) {
      responses.push({ text: "❌ Domingo fechamos. " });
      return responses;
    }
    session.selectedDay = selectedDate.toLocaleDateString("pt-BR");
    session.stage = "ETAPA7_TIME";
    responses.push({ text: `📅 ${selectedDate.toLocaleDateString("pt-BR", { weekday: "long" })}\n\n⏰ Horários?\n\n*1* - 08:00\n*2* - 10:00\n*3* - 14:00\n*4* - 16:00 ` });
    return responses;
  }

  responses.push({ text: buildCalendarPrompt(new Date()) });
  return responses;
}

async function handleTimeSelection(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const timeSlots: Record<string, { start: string; end: string }> = {
    "1": { start: "08:00", end: "10:00" },
    "2": { start: "10:00", end: "12:00" },
    "3": { start: "14:00", end: "16:00" },
    "4": { start: "16:00", end: "18:00" },
  };

  if (!timeSlots[message.trim()]) {
    responses.push({ text: "❌ Horário inválido. " });
    return responses;
  }

  const slot = timeSlots[message.trim()];
  session.selectedTime = `${slot.start} às ${slot.end}`;
  session.stage = "ETAPA8_PAYMENT";

  responses.push({ text: `⏰ *${slot.start}* — ótimo! ` });
  responses.push({ text: buildPaymentOptionsText() });
  return responses;
}

async function handleReminderStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  session.wantsReminder = /^(1|sim|s|quero|yes)$/.test(input);
  session.stage = "ETAPA8_PAYMENT";

  responses.push({ text: session.wantsReminder ? "🔔 Lembrete ativado! " : "Ok! " });
  responses.push({ text: buildPaymentOptionsText() });
  return responses;
}

async function handlePaymentSelection(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const paymentMethods: Record<string, string> = {
    "1": "PIX",
    "2": "Cartão",
    "3": "Dinheiro",
  };

  if (!paymentMethods[message.trim()]) {
    responses.push({ text: "❌ Forma inválida. " });
    return responses;
  }

  session.paymentMethod = paymentMethods[message.trim()];
  session.stage = "ETAPA10_CONFIRM";

  const baseQuote = Number(session.quote ?? calculateBasePrice(session));
  const complementValue = Number(session.upsellValue ?? 0);
  const totalValue = baseQuote + complementValue;

  responses.push({
    text: [
      "━━━━━━━━━━━━━━━",
      "📋 **RESUMO DO AGENDAMENTO**",
      `👤 ${session.customerName ?? "Cliente"}`,
      `🧽 *${session.selectedServiceName ?? "Serviço"}*`,
      `${session.upsellLabel ? `✨ + ${session.upsellLabel}` : ""}`,
      `🚘 ${session.vehicle.model} ${session.vehicle.year ?? ""}`,
      `📅 ${session.selectedDay ?? "—"}`,
      `⏰ ${session.selectedTime ?? "—"}`,
      `💳 ${session.paymentMethod}`,
      `💰 **R$ ${totalValue.toFixed(2).replace(".", ",")}**`,
      "━━━━━━━━━━━━━━━",
      "",
      "✅ Confirma? (sim/não)",
    ].join("\n"),
  });
  return responses;
}

async function handleFinalConfirm(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|confirmo|agendar)$/i.test(input);
  const isNo = /^(nao|não|n|2|no|alterar|cancelar)$/i.test(input);

  if (isYes) {
    session.stage = "ETAPA2_MAIN_MENU";
    responses.push({
      text: `✅ *Tudo certo, ${session.customerName ?? "Cliente"}!* 🎉\n\nSeu horário tá garantido — mal podemos esperar pra deixar seu carro brilhando. ✨\n\n📍 *Rua das Oficinas, 100 - SP*\n🕐 *Seg a Sáb, 08:00 às 18:00*\n\n📌 *Cancelamento até 2h antes sem custo.*\n\n─────────────────\n⭐ **Avaliação pós-serviço**\n\nGostou do atendimento? Avalie de 1 a 5!\n\n*1* - ⭐\n*2* - ⭐⭐\n*3* - ⭐⭐⭐\n*4* - ⭐⭐⭐⭐\n*5* - ⭐⭐⭐⭐⭐\n\nE indicou alguém? Ambos ganham 10% no próximo! 🤝\n\n─────────────────\nPosso ajudar com mais alguma coisa? `,
    });
    return responses;
  }

  responses.push({ text: "Sem problemas! Alterar algo? " });
  session.stage = "ETAPA2_MAIN_MENU";
  return responses;
}

// Handler for photo step (ask if wants to upload)
async function handlePhotoStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const wantsPhoto = /^(1|sim|s|foto|imagem|anexar|url)$/i.test(input);

  if (wantsPhoto) {
    session.awaitingPhotoUpload = true;
    session.stage = "ETAPA8_PHOTO_UPLOAD";
    responses.push({
      text: "📷 Ótimo! Cole ou cole a URL da foto do seu veículo (ex: https://exemplo.com/carro.jpg)",
    });
    return responses;
  }

  // Se não quer foto, vai para coleta manual de veículo
  session.stage = "ETAPA4_VEHICLE";
  responses.push({ text: "Sem problemas! Me conta sobre seu veículo?\n\nModelo, ano, cor e estado." });
  return responses;
}

// Handler for photo upload and AI analysis
async function handlePhotoUpload(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  // Detecta URL de imagem na mensagem (http/https ou file://)
  const photoUrlMatch = message.match(/(https?:\/\/.*\.(jpg|jpeg|png|webp)|file:\/\/.*?\.(jpg|jpeg|png|webp))/i);

  if (!photoUrlMatch) {
    responses.push({ text: "📷 Envie a foto do veículo (URL da imagem)." });
    return responses;
  }

  const photoUrl = photoUrlMatch[1];
  session.vehiclePhotoUrl = photoUrl;

  // Chamar API de IA para análise
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const analysisResponse = await fetch(`${baseUrl}/api/vehicle/analyze-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: photoUrl }),
    });

    if (analysisResponse.ok) {
      const result = await analysisResponse.json();
      if (result.success && result.data) {
        session.vehiclePhotoAttached = true;
        session.vehicle = {
          model: result.data.model || "Veículo identificado",
          year: parseInt(result.data.year) || new Date().getFullYear(),
          color: result.data.color || "prata",
          condition: normalizeConditionValue(result.data.condition || "bom"),
        };

        responses.push({
          text: `🤖 *Análise de IA concluída!*${result.simulated ? " (simulação)" : ""}\n\nDetectei:\n🚘 Modelo: ${result.data.model}\n📅 Ano: ${result.data.year}\n🎨 Cor: ${result.data.color}\n🔧 Estado: ${result.data.condition}\n\n`,
        });

        session.stage = "ETAPA4_VEHICLE_CONFIRM";
        responses.push({ text: buildVehicleConfirmationPrompt(result.data) });
        return responses;
      }
    }
  } catch (error) {
    console.error("Erro na análise de imagem:", error);
  }

  // Fallback
  session.vehiclePhotoAttached = true;
  session.vehicle = {
    model: "Veículo identificado",
    year: new Date().getFullYear() - 4,
    color: "prata",
    condition: "bom",
  };

  responses.push({ text: buildVehicleConfirmationPrompt({
    model: "Veículo identificado",
    year: String(new Date().getFullYear() - 4),
    color: "prata",
    condition: "bom",
  }) });

  session.stage = "ETAPA4_VEHICLE_CONFIRM";
  return responses;
}

async function handleFAQ(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  responses.push({ text: "👍 Vou ajudar! 'menu' pra voltar. " });
  session.stage = "ETAPA2_MAIN_MENU";
  return responses;
}

function buildPaymentOptionsText() {
  return "**Pagamento**\n\n*1* 💳 PIX\n*2* 💳 Cartão\n*3* 💵 Dinheiro";
}

// Exports for compatibility
export { buildVehicleCollectionPrompt, buildBudgetSummaryText, normalizeConditionValue, buildPaymentOptionsText };

