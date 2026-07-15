// Test bot processor - fluxo idêntico ao WhatsApp flow
// Usa as MESMAS funções de validação, parsing e formatação do whatsapp-flow.ts
// para garantir comportamento idêntico entre teste e produção

import type { FlowState, FlowStage } from "./whatsapp-flow-types";
import {
  normalizeYes,
  normalizeNo,
  shouldSkipCouponPrompt,
  isFirstTimeCustomer,
  applyFirstTimeDiscount as applyFirstTimeDiscountCore,
  buildPaymentOptionsText,
  handleLoyaltyStep,
  handleLogistics,
  handlePixChoice,
  handleReceiptUpload,
  handleCouponStep,
  handleReminderStep as handleReminderStepCore,
  handleFinalConfirm,
  handleSummaryConfirm,
  handleRating,
  handleServiceQuestion,
  handleFAQ,
  handleCancellationDetection,
  handleDiscountResponse,
  type FlowResponse,
  type FlowResult,
} from "./whatsapp-flow-core";
import {
  isValidCustomerName,
  normalizeVehicleConditionValue,
  buildVehicleCollectionPrompt,
  buildVehicleConfirmationPrompt,
} from "./flow-validation";
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from "./calendar-helper";
import {
  etapa1Welcome,
  etapa2MainMenu,
  serviceDetail,
  formatHours,
  etapa8PixChoice,
  etapa8ReceiptUpload,
  etapa8ReceiptInvalid,
  etapa8ReceiptError,
} from "./whatsapp-flow-messages";
import { recordTestBotRating } from "./test-bot-evaluation-store";
import { loadPromptMap } from "./bot-prompts";
import { parseVehicleMessage } from "./whatsapp-vehicle-parse";
import { loadWhatsAppCatalog } from "./whatsapp-service-catalog";
import { prisma } from "./prisma";
import { buildAvailableSlotsForDay, parseTimeSelection } from "./appointments";
import { calculateDistance, calculatePickupFee } from "./maps";
import { findCouponByCode } from "./coupons";
import { format } from "date-fns";
import { answerCustomerDoubt } from "./whatsapp-ai";
import { generateSummaryCard, generateSummaryText, SummaryCardData } from "./summary-card";
import { generatePixQrCode, generatePixPayload } from "./pix-qr";
import { analyzeReceiptImage, validateReceiptAmount } from "./receipt-analyzer";
import type { FlowContext } from "./whatsapp-flow-messages";
import { testBotLogger } from "./structured-logger";
import { startFunnel, trackFunnelProgress, trackAbandonment, completeFunnel } from "./funnel-tracker";
import { generateAndSendReceipt } from "./receipt-generator";
import { detectCancellationIntent, detectCancellationReason, calculateDiscount, generateDiscountOfferMessage, saveDiscountOffer, isDiscountOfferValid } from "./cancellation-detector";

import type { FlowStage } from "./whatsapp-flow-types";

// Analytics logging function
async function logStageTransition(sessionId: string, stage: string, message: string) {
  try {
    console.log(`[ANALYTICS] Session: ${sessionId}, Stage: ${stage}, Message: ${message}, Time: ${new Date().toISOString()}`);
  } catch (error) {
    console.error("[ANALYTICS] Error logging stage transition:", error);
  }
}

// Load payment context from database
async function loadPaymentContext(): Promise<FlowContext> {
  const s = await prisma.settings.findUnique({ where: { id: "default" } });
  return {
    businessName: s?.businessName ?? "Garagem do Ka",
    hours: "08:00 às 18:00",
    address: s?.businessAddress ?? "",
    pixKey: s?.pixKey ?? null,
    pixHolder: s?.pixHolderName ?? null,
    pixBank: s?.pixBank ?? null,
    pixMerchantCity: s?.pixMerchantCity ?? "Jundiai",
    pixQrCodeImage: s?.pixQrCodeImage ?? null,
  };
}

// First-time customer discount check
async function isFirstTimeCustomer(phone: string): Promise<boolean> {
  try {
    const appointments = await prisma.appointment.count({
      where: {
        client: { phone },
        status: { in: ["COMPLETED", "CONFIRMED"] },
      },
    });
    return appointments === 0;
  } catch (error) {
    console.error("[isFirstTimeCustomer] Error:", error);
    return false;
  }
}

async function applyFirstTimeDiscount(session: TestSession, responses: TestResponse[]): Promise<void> {
  if (session.couponCode) return; // Já tem cupom aplicado

  const coupon = await findCouponByCode("PRIMEIRA10");
  if (coupon && coupon.active) {
    session.couponCode = "PRIMEIRA10";
    session.couponDiscount = coupon.type === "percent" 
      ? (session.quote || 0) * (Number(coupon.amount) / 100)
      : Number(coupon.amount);
    responses.push({ text: `🎁 *Bônus!* Primeira vez: 10% de desconto aplicado! (-R$ ${session.couponDiscount?.toFixed(2).replace('.', ',')})` });
  }
}

// Natural response normalization
function normalizeYes(input: string): boolean {
  const yesPatterns = [
    /^(sim|s|1|yes|quero|ok|vamos|confirmo|agendar|aceito|bora|tá|estou|de acordo|positivo)$/i,
    /^(claro|certo|entendido|combina|boa|beleza|perfeito|sucesso)$/i,
  ];
  return yesPatterns.some(pattern => pattern.test(input));
}

function normalizeNo(input: string): boolean {
  const noPatterns = [
    /^(nao|não|n|2|no|cancelar|alterar|desistir|rejeito|negativo|nao quero|não quero|desculpe)$/i,
    /^(ops|esqueci|melhor depois|talvez|mais tarde|ainda não|ainda nao)$/i,
  ];
  return noPatterns.some(pattern => pattern.test(input));
}

interface TestSession {
  sessionId: string;
  stage: string;
  welcomed: boolean;
  customerName: string | null;
  selectedService: string | null;
  selectedCategoryNumber?: number | null;
  selectedSubService: string | null;
  selectedServiceName: string | null;
  lastInteractionAt?: number | null;
  upsellOfferIndex?: number;
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
  selectedDateIso?: string | null;
  selectedTime?: string | null;
  availableSlots?: string[] | null;
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
  pickupAddress?: string | null;
  needsReturn?: boolean;
  // Payment fields
  paymentStatus?: string | null;
  paymentGateway?: string | null;
  paymentMethod?: string | null;
  transactionId?: string | null;
  paidAt?: Date | null;
  paymentSimulationCode?: string | null;
  pixPaymentType?: "now" | "delivery";
  receiptImageUrl?: string | null;
  receiptAmount?: number | null;
  receiptValidationAttempts?: number;
  partialPayments?: Array<{ amount: number; imageUrl: string }>;
  totalPaid?: number;
  awaitingReceiptUpload?: boolean;
  // Funil e desconto
  awaitingDiscountResponse?: boolean;
  discountOffer?: any;
  discountOriginalPrice?: number;
  // Reminder preference
  reminderPreference?: string | null;
  awaitingPickupAddress?: boolean;
  awaitingReturnPreference?: boolean;
  awaitingPhotoUpload?: boolean;
  awaitingServiceRecommendation?: boolean;
  serviceRecommendation?: string | null;
  awaitingServiceQuestion?: boolean;
  testDate?: string | null;
  testHours?: string | null;
}

// Helper to convert TestSession to FlowState for core handlers
function testSessionToFlowState(session: TestSession): FlowState {
  return {
    stage: session.stage as FlowStage,
    customerName: session.customerName || undefined,
    serviceKey: session.selectedService || undefined,
    serviceLabel: session.selectedServiceName || undefined,
    couponCode: session.couponCode || undefined,
    couponDiscountApplied: session.couponDiscount || undefined,
    loyaltyPoints: session.loyaltyPoints || 0,
    vehicleModel: session.vehicle.model || undefined,
    vehicleYear: session.vehicle.year?.toString() || undefined,
    vehicleColor: session.vehicle.color || undefined,
    vehicleCondition: session.vehicle.condition,
    quoteMin: session.quote || undefined,
    quoteMax: session.quote || undefined,
    upsellLabel: session.upsellLabel || undefined,
    upsellAccepted: session.upsellAccepted,
    upsellValue: session.upsellValue || undefined,
    dayLabel: session.selectedDay || undefined,
    dayDate: session.selectedDateIso || undefined,
    startTime: session.selectedTime || undefined,
    availableSlots: session.availableSlots || undefined,
    reminderEnabled: session.wantsReminder || undefined,
    reminderPreference: session.reminderPreference as "30min" | "1hour" | "1day" | "none" || undefined,
    needsPickup: session.wantsPickupDelivery || undefined,
    pickupFee: session.pickupDeliveryFee || undefined,
    pickupAddress: session.pickupAddress || undefined,
    needsReturn: session.needsReturn || undefined,
    paymentMethod: session.paymentMethod || undefined,
    pixPaymentType: session.pixPaymentType || undefined,
    receiptImageUrl: session.receiptImageUrl || undefined,
    receiptAmount: session.receiptAmount || undefined,
    receiptValidationAttempts: session.receiptValidationAttempts || undefined,
    partialPayments: session.partialPayments || undefined,
    totalPaid: session.totalPaid || undefined,
    awaitingReceiptUpload: session.awaitingReceiptUpload || undefined,
    awaitingDiscountResponse: session.awaitingDiscountResponse || undefined,
    discountOffer: session.discountOffer || undefined,
    discountOriginalPrice: session.discountOriginalPrice || undefined,
    awaitingPickupAddress: session.awaitingPickupAddress || undefined,
    awaitingReturnPreference: session.awaitingReturnPreference || undefined,
    awaitingServiceQuestion: session.awaitingServiceQuestion || undefined,
    serviceRecommendation: session.serviceRecommendation || undefined,
    awaitingServiceRecommendation: session.awaitingServiceRecommendation || undefined,
  };
}

// Helper to update TestSession from FlowState
function updateTestSessionFromFlowState(session: TestSession, state: FlowState): TestSession {
  return {
    ...session,
    stage: state.stage,
    customerName: state.customerName || null,
    selectedService: state.serviceKey || null,
    selectedServiceName: state.serviceLabel || null,
    couponCode: state.couponCode || null,
    couponDiscount: state.couponDiscountApplied || null,
    loyaltyPoints: state.loyaltyPoints || 0,
    vehicle: {
      ...session.vehicle,
      model: state.vehicleModel || null,
      year: state.vehicleYear ? parseInt(state.vehicleYear) : null,
      color: state.vehicleColor || null,
      condition: (state.vehicleCondition as any) || "normal",
    },
    quote: state.quoteMin || null,
    upsellLabel: state.upsellLabel || undefined,
    upsellAccepted: state.upsellAccepted,
    upsellValue: state.upsellValue || undefined,
    selectedDay: state.dayLabel || undefined,
    selectedDateIso: state.dayDate || undefined,
    selectedTime: state.startTime || undefined,
    availableSlots: state.availableSlots || undefined,
    wantsReminder: state.reminderEnabled,
    reminderPreference: state.reminderPreference || null,
    wantsPickupDelivery: state.needsPickup,
    pickupDeliveryFee: state.pickupFee,
    pickupAddress: state.pickupAddress || null,
    needsReturn: state.needsReturn,
    paymentMethod: state.paymentMethod || undefined,
    pixPaymentType: state.pixPaymentType || undefined,
    receiptImageUrl: state.receiptImageUrl || undefined,
    receiptAmount: state.receiptAmount || undefined,
    receiptValidationAttempts: state.receiptValidationAttempts || undefined,
    partialPayments: state.partialPayments || undefined,
    totalPaid: state.totalPaid || undefined,
    awaitingReceiptUpload: state.awaitingReceiptUpload || undefined,
    awaitingDiscountResponse: state.awaitingDiscountResponse || undefined,
    discountOffer: state.discountOffer || undefined,
    discountOriginalPrice: state.discountOriginalPrice || undefined,
    awaitingPickupAddress: state.awaitingPickupAddress || undefined,
    awaitingReturnPreference: state.awaitingReturnPreference || undefined,
    awaitingServiceQuestion: state.awaitingServiceQuestion || undefined,
    serviceRecommendation: state.serviceRecommendation || undefined,
    awaitingServiceRecommendation: state.awaitingServiceRecommendation || undefined,
  };
}

// Helper to convert FlowResponse[] to TestResponse[]
function flowResponsesToTestResponses(flowResponses: FlowResponse[]): TestResponse[] {
  return flowResponses.map(response => ({
    text: response.text,
    mediaUrl: response.mediaUrl,
    mediaType: response.mediaType,
  }));
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
  const now = Date.now();

  // Iniciar rastreamento de funil se for primeira mensagem
  if (!session.lastInteractionAt) {
    await startFunnel(sessionId, session.customerName || session.sessionId || "");
  }

  // Detectar intenção de cancelamento
  if (detectCancellationIntent(message)) {
    const reason = detectCancellationReason(message);
    const originalPrice = session.quote || 100; // Valor estimado
    const offer = calculateDiscount(reason, originalPrice);

    responses.push({
      text: generateDiscountOfferMessage(
        session.customerName || "Cliente",
        originalPrice,
        offer
      ),
    });

    // Salvar oferta no banco
    await saveDiscountOffer(
      sessionId,
      session.sessionId || "",
      originalPrice,
      offer.discountPercentage,
      new Date(Date.now() + offer.validForMinutes * 60 * 1000)
    );

    // Adicionar estado de espera de resposta de desconto
    session.awaitingDiscountResponse = true;
    session.discountOffer = offer;
    session.discountOriginalPrice = originalPrice;

    return responses;
  }

  // Resposta a oferta de desconto
  if (session.awaitingDiscountResponse) {
    const input = message.trim().toLowerCase();
    if (input === "1" || /sim|quero|aceito|aprovei/i.test(input)) {
      // Aceitar desconto
      const offer = session.discountOffer;
      const discountedPrice = (session.discountOriginalPrice || 100) * (1 - offer.discountPercentage / 100);
      session.quote = discountedPrice;
      session.awaitingDiscountResponse = false;
      session.discountOffer = null;

      responses.push({
        text: `✅ Ótimo! ${offer.discountReason}\n\nNovo valor: R$ ${discountedPrice.toFixed(2).replace('.', ',')}\n\nVamos continuar o agendamento com este valor especial!`,
      });

      testBotLogger.info("Cliente aceitou oferta de desconto", { sessionId, discountPercentage: offer.discountPercentage });
      return responses;
    } else if (input === "2" || /nao|não|cancelar|recusar/i.test(input)) {
      // Recusar desconto e cancelar
      session.awaitingDiscountResponse = false;
      session.discountOffer = null;
      session.stage = "ETAPA2_MAIN_MENU";

      responses.push({
        text: "Entendido. Sem problemas! \n\nVoltamos ao menu principal. O que você gostaria de fazer?",
      });

      testBotLogger.info("Cliente recusou oferta de desconto", { sessionId });
      await trackAbandonment(sessionId, session.sessionId || "", "RECUSOU_DESCONTO");
      return responses;
    }
  }

  // Universal "0" to go back to main menu
  if (message.trim() === "0") {
    const wctx = await loadWhatsAppCatalog(true);
    const prompts = await loadPromptMap();
    session.stage = "ETAPA2_MAIN_MENU";
    await trackFunnelProgress(sessionId, session.sessionId || "", "ETAPA2_MAIN_MENU");
    responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
    return responses;
  }

  // Log analytics: stage transition
  await logStageTransition(sessionId, session.stage, message.trim());
  await trackFunnelProgress(sessionId, session.sessionId || "", session.stage);
  session.lastInteractionAt = now;

  if (session.lastInteractionAt && now - session.lastInteractionAt > 30 * 60 * 1000) {
    resetSessionForNewStart(session);
    session.lastInteractionAt = now;
    responses.push({ text: buildWelcomeText() });
    return responses;
  }

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

    case "ETAPA8_PIX_CHOICE":
      return handlePixChoice(message, session, responses);

    case "ETAPA8_RECEIPT_UPLOAD":
      return handleReceiptUpload(message, session, responses);

    case "ETAPA10_CONFIRM":
      return handleFinalConfirm(message, session, responses);

    case "ETAPA11_RATING":
      return handleRating(message, session, responses);

    case "ETAPA10_FAQ":
      return handleFAQ(message, session, responses);

    case "ETAPA11_SERVICE_QUESTION":
      return handleServiceQuestion(message, session, responses);

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

function buildWelcomeText(): string {
  return "👋 Olá! Sou o Teste Bot da Garagem do Ka. Vamos começar? Me diz como posso te chamar.";
}

export function shouldSkipCouponPrompt(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return /^(2|nao|não|n|sem|pular|ignorar|nenhum|nao tenho|não tenho|sem cupom|sem desconto|nenhum cupom|nao tenho cupom|não tenho cupom)$/i.test(normalized);
}

async function calculateBasePrice(session: TestSession): Promise<number> {
  // Try to get real price from database based on selected service
  const serviceKey = session.selectedSubService ?? session.selectedService;
  if (serviceKey) {
    try {
      const service = await prisma.service.findFirst({
        where: {
          active: true,
          OR: [
            { catalogKey: serviceKey },
            { name: { contains: serviceKey, mode: "insensitive" } },
          ],
        },
      });
      if (service?.price) {
        const isSuv = isSuvLikeVehicle(session.vehicle.model ?? "");
        const isBad = session.vehicle.condition === "ruim";
        let basePrice = Number(service.price);
        
        // Apply SUV/bad condition multipliers
        if (isSuv) basePrice = Math.round(basePrice * 1.2);
        if (isBad) basePrice = Math.round(basePrice * 1.08);
        
        return basePrice;
      }
    } catch (err) {
      console.error("[test-bot] Error fetching service price:", err);
    }
  }
  
  // Fallback to hardcoded values if service not found
  const isSuv = isSuvLikeVehicle(session.vehicle.model ?? "");
  const isBad = session.vehicle.condition === "ruim";
  return isSuv ? (isBad ? 130 : 110) : (isBad ? 85 : 75);
}

function isSuvLikeVehicle(model: string | null): boolean {
  if (!model) return false;
  const t = model.toLowerCase();
  return /suv|pickup|picape|van|camionete|4x4|hilux|ranger|s10|toro|compass|renegade|t-cross|creta|hrv|sw4/i.test(t);
}

async function getDynamicUpsellOffer(session: TestSession): Promise<{ label: string; value: number } | null> {
  try {
    // Get all active services from database
    const allServices = await prisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, price: true, catalogKey: true },
    });
    
    if (allServices.length === 0) return null;
    
    // Get current service info to exclude it
    const currentServiceKey = session.selectedSubService ?? session.selectedService;
    const currentServiceName = session.selectedServiceName?.toLowerCase() || "";
    
    // Filter cheap services (price < R$ 60)
    const cheapServices = allServices.filter(s => {
      const price = Number(s.price);
      const serviceName = s.name.toLowerCase();
      const serviceKey = s.catalogKey?.toLowerCase() || "";
      
      // Exclude current service by key or name
      if (currentServiceKey) {
        if (serviceKey.includes(currentServiceKey.toLowerCase()) || currentServiceKey.toLowerCase().includes(serviceKey)) {
          return false;
        }
      }
      if (serviceName.includes(currentServiceName) || currentServiceName.includes(serviceName)) {
        return false;
      }
      
      // Filter by price (cheap services for upsell)
      return price > 0 && price < 60;
    });
    
    if (cheapServices.length === 0) return null;
    
    // Randomly select one
    const randomIndex = Math.floor(Math.random() * cheapServices.length);
    const selected = cheapServices[randomIndex];
    
    return {
      label: selected.name,
      value: Number(selected.price),
    };
  } catch (err) {
    console.error("[test-bot] Error fetching upsell services:", err);
    return null;
  }
}

function getUpsellVariants(category: string | null) {
  const variants: Record<string, { label: string; value: number }[]> = {
    polimento: [
      { label: "Proteção de Pintura Vitrificada", value: 85 },
      { label: "Polimento Técnico + Brilho Extremo", value: 95 },
      { label: "Revitalização de Cristalização", value: 90 },
    ],
    lavagem: [
      { label: "Hidratação de Plásticos + Shine", value: 45 },
      { label: "Impermeabilização de Tecidos", value: 55 },
      { label: "Proteção NanoShield", value: 65 },
    ],
    interior: [
      { label: "Aromatização Premium", value: 35 },
      { label: "Limpeza de Couro + Hidratação", value: 70 },
      { label: "Proteção Antibacteriana", value: 60 },
    ],
    protecao: [
      { label: "Selante Cerâmico Rápido", value: 120 },
      { label: "Proteção de Pintura Vitrificada", value: 85 },
      { label: "Blindagem Leve de Pintura", value: 110 },
    ],
    default: [
      { label: "Proteção de Pintura Vitrificada", value: 85 },
      { label: "Aromatização Premium", value: 35 },
      { label: "Hidratação de Plásticos + Shine", value: 45 },
    ],
  };
  return variants[category ?? "default"] ?? variants.default;
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
  pickupFee?: number | null;
  totalValue?: number | null;
}) {
  const serviceValue = Number(params.serviceValue ?? 0);
  const complementValue = Number(params.complementValue ?? 0);
  const couponDiscount = Number(params.couponDiscount ?? 0);
  const loyaltyDiscount = Number(params.loyaltyDiscount ?? 0);
  const pickupFee = Number(params.pickupFee ?? 0);
  const totalValue = Number(params.totalValue ?? serviceValue + complementValue + pickupFee - couponDiscount - loyaltyDiscount);

  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **Seu orçamento**",
    `- Serviço: ${params.serviceLabel ?? "Serviço premium"} — **R$ ${serviceValue.toFixed(2).replace(".", ",")}**`,
  ];

  if (complementValue > 0) {
    lines.push(`- Proteção: **R$ ${complementValue.toFixed(2).replace(".", ",")}**`);
  }

  if (pickupFee > 0) {
    lines.push(`- Leva e traz: **R$ ${pickupFee.toFixed(2).replace(".", ",")}**`);
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

  // Check if first-time customer and apply discount
  const isFirstTime = await isFirstTimeCustomer(sessionId); // For test-bot, use sessionId as phone proxy
  if (isFirstTime) {
    await applyFirstTimeDiscount(session, responses);
  }

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

  // Special case: option 8 is "Ajuda na escolha" - go directly to AI FAQ
  if (choice === "8") {
    session.stage = "ETAPA10_FAQ";
    responses.push({ text: "🤔 Descreva em texto livre o que você precisa ou está procurando para o seu carro (ex: 'preciso de limpeza interna', 'tem manchas no estofado', 'quer dar brilho na pintura')." });
    session.awaitingServiceRecommendation = true;
    return responses;
  }

  const categoryMap: Record<string, string> = {
    "1": "lavagem",
    "2": "polimento",
    "3": "protecao",
    "4": "interior",
    "5": "detalhes",
    "6": "revitalizacao",
    "7": "pacotes",
  };

  session.selectedService = categoryMap[choice];
  session.selectedCategoryNumber = Number(choice);
  session.stage = "ETAPA2_SUB";

  const wctx = await loadWhatsAppCatalog(true);
  const categoryKeys = wctx.categories[Number(choice)]?.keys ?? [];
  const categoryServices = (categoryKeys.length > 0
    ? categoryKeys
        .map((key: string) => wctx.catalog[key])
        .filter(Boolean)
    : Object.values(wctx.catalog).filter((s: any) =>
        s.key.toLowerCase().includes(session.selectedService ?? "")
      )) as any[];

  const resolvedServices = categoryServices.length > 0
    ? categoryServices
    : [
        {
          key: `${session.selectedService ?? "servico"}_fallback`,
          label: session.selectedService === "polimento"
            ? "Polimento Premium"
            : `Opção de ${wctx.categories[Number(choice)]?.title ?? "categoria"}`,
        },
      ];

  let subMenu = "Escolha um serviço:\n\n";
  subMenu += "*0* - Voltar ao início\n";
  resolvedServices.forEach((service: any, idx: number) => {
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
  const categoryKeys = wctx.categories[Number(session.selectedCategoryNumber ?? 1)]?.keys ?? [];
  const categoryServices = (categoryKeys.length > 0
    ? categoryKeys
        .map((key: string) => wctx.catalog[key])
        .filter(Boolean)
    : Object.values(wctx.catalog).filter((s: any) =>
        s.key.toLowerCase().includes(session.selectedService ?? "")
      )) as any[];

  if (choice === 0) {
    session.stage = "ETAPA2_MAIN_MENU";
    const wctx = await loadWhatsAppCatalog(true);
    responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
    return responses;
  }

  if (isNaN(choice) || choice < 1 || choice > categoryServices.length) {
    responses.push({ text: `❌ Opção inválida. Escolha entre 1 e ${categoryServices.length}, ou 0 para voltar ao início.` });
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

  if (choice === "0") {
    session.stage = "ETAPA2_MAIN_MENU";
    const wctx = await loadWhatsAppCatalog(true);
    responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
    return responses;
  }

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
      session.stage = "ETAPA11_SERVICE_QUESTION";
      session.awaitingServiceQuestion = true;
      responses.push({ text: "📝 Qual sua dúvida sobre o serviço selecionado? Vou ajudar! " });
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
    const basePrice = await calculateBasePrice(session);
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

  // Skip upsell for now - go directly to logistics
  // TODO: Implement smart upsell based on vehicle type and service category
  session.stage = "ETAPA10_LOGISTICS";
  responses.push({
    text: "🚚 Como prefere?\n\n*1* - Deixe eu levo o carro até a estética\n*2* - A estética vai buscar o carro",
  });
  return responses;
}

async function handleUpsell(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const choice = message.trim();
  const offer = session.upsellOffer ?? getUpsellVariants(session.selectedService)[0];

  if (choice === "1" || choice.toLowerCase() === "sim") {
    session.upsellAccepted = true;
    session.upsellLabel = offer.label;
    session.upsellValue = offer.value;
    responses.push({ text: `✅ Incluído! *${offer.label}* adicionado ao seu agendamento.` });
  } else {
    session.upsellAccepted = false;
    session.upsellValue = 0;
    responses.push({ text: "Tudo bem! Seguindo com o serviço principal." });
  }

  // After upsell, go to logistics (pickup/delivery)
  session.stage = "ETAPA10_LOGISTICS";
  responses.push({
    text: "🚚 Como prefere?\n\n*1* - Deixe eu levo o carro até a estética\n*2* - A estética vai buscar o carro"
  });
  return responses;
}

async function handleCouponStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim();
  const skip = shouldSkipCouponPrompt(input);

  if (skip) {
    session.stage = "ETAPA9_REMINDER";
    responses.push({
      text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
    });
    return responses;
  }

  if (/^(1|sim|s|yes|ok|prosseguir|tenho|com cupom)$/i.test(input)) {
    session.stage = "ETAPA9_COUPON";
    responses.push({ text: "💬 Me envie o código do cupom para validar.\n\nEx: *SAVE10*" });
    return responses;
  }

  if (input) {
    const code = input.toUpperCase();
    const coupon = await findCouponByCode(code);
    if (!coupon || !coupon.active) {
      responses.push({ text: `⚠️ Cupom *${code}* não foi encontrado ou está inativo.` });
      session.stage = "ETAPA9_COUPON";
      return responses;
    }

    session.couponCode = code;
    session.couponDiscount = Number(coupon.amount ?? 10);
    responses.push({ text: `🎟️ Cupom *${code}* aplicado!` });
  }

  session.stage = "ETAPA9_REMINDER";
  responses.push({
    text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
  });
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
  return await handleShowBudget(session, responses);
}

async function handleShowBudget(session: TestSession, responses: TestResponse[]): Promise<TestResponse[]> {
  const baseQuote = Number(session.quote ?? await calculateBasePrice(session));
  const complementValue = Number(session.upsellValue ?? 0);
  const couponDiscount = Number(session.couponDiscount ?? 0);
  const loyaltyDiscount = session.loyaltyPoints && session.loyaltyPoints >= 100 ? 10 : 0;

  responses.push({
    text: buildBudgetSummaryText({
      serviceLabel: session.selectedServiceName || "Serviço premium",
      serviceValue: baseQuote,
      complementValue,
      couponDiscount,
      loyaltyDiscount: session.loyaltyPoints ? (session.quote ?? await calculateBasePrice(session)) * (loyaltyDiscount / 100) : 0,
      pickupFee: session.pickupDeliveryFee ?? 0,
      totalValue: baseQuote + complementValue + (session.pickupDeliveryFee ?? 0) - couponDiscount,
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
      text: "🚚 Como prefere?\n\n*1* - Deixe eu levo o carro até a estética\n*2* - A estética vai buscar o carro",
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
  const input = message.trim();
  const choice = input.trim();
  const wantsDelivery = choice === "2" || /^(busca|entrega|sim|delivery)$/i.test(input.toLowerCase());

  if (session.awaitingPickupAddress) {
    const address = input.trim();
    if (!address) {
      responses.push({ text: "📍 Me envie o endereço completo onde o carro está para calcular a taxa de busca." });
      return responses;
    }

    session.pickupAddress = address;
    const settings = (await prisma.settings.findUnique({ where: { id: "default" } })) as any;
    const feePerKm = Number(settings?.pickupFeePerKm ?? 2.5);
    const feeBase = Number(settings?.pickupFeeBase ?? 0);
    const distance = await calculateDistance(address);
    session.pickupDeliveryFee = distance ? calculatePickupFee(distance.distanceKm, feePerKm, feeBase) : 0;
    session.awaitingPickupAddress = false;
    session.awaitingReturnPreference = true;
    responses.push({ text: `📍 Endereço salvo.\n💰 Taxa de busca (R$ ${feePerKm.toFixed(2)}/km × ${distance?.distanceKm ?? 0} km): R$ ${session.pickupDeliveryFee?.toFixed(2)}\n\nQuer que devolvamos o veículo até você após o serviço?\n\n*1* Sim\n*2* Não` });
    return responses;
  }

  if (session.awaitingReturnPreference) {
    const wantsReturn = /^(1|sim|s|quero|yes)$/i.test(input.toLowerCase());
    session.needsReturn = wantsReturn;
    session.awaitingReturnPreference = false;
    session.stage = "ETAPA7_DAY";
    responses.push({ text: wantsReturn ? "🔄 Devolução incluída no resumo." : "📍 Sem devolução, tudo certo." });
    const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
    responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
    return responses;
  }

  if (wantsDelivery) {
    session.wantsPickupDelivery = true;
    session.awaitingPickupAddress = true;
    session.pickupDeliveryFee = 0;
    responses.push({ text: "🚚 Ótimo! Me envie o endereço completo onde o carro está para calcular a taxa de busca." });
    return responses;
  }

  session.wantsPickupDelivery = false;
  session.pickupDeliveryFee = 0;
  session.stage = "ETAPA7_DAY";
  responses.push({ text: "📍 Combinado! Você pode levar o carro até a loja quando puder." });
  const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
  responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
  return responses;
}

async function getDynamicTimeSlots(session: TestSession, dateStr: string): Promise<string[]> {
  const wctx = await loadWhatsAppCatalog(true);
  const serviceKey = session.selectedSubService ?? session.selectedService ?? "lavagem_detalhada";
  const service = wctx.servicesByKey[serviceKey];
  const durationMin = service?.durationMin ?? 90;

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const fallbackSettings = {
    businessHoursStart: "08:00",
    businessHoursEnd: "18:00",
    lunchBreakStart: null as string | null,
    lunchBreakEnd: null as string | null,
    slotDurationMin: 30,
    workingDays: "1,2,3,4,5,6",
  };

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      date: {
        gte: new Date(`${dateStr}T00:00:00`),
        lt: new Date(`${dateStr}T23:59:59.999`),
      },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { startTime: true, endTime: true },
  });

  // Use test date if available, otherwise use current date
  const now = session.testDate ? new Date(session.testDate) : new Date();

  return buildAvailableSlotsForDay({
    dateStr,
    durationMin,
    settings: settings
      ? {
          businessHoursStart: settings.businessHoursStart,
          businessHoursEnd: settings.businessHoursEnd,
          lunchBreakStart: settings.lunchBreakStart,
          lunchBreakEnd: settings.lunchBreakEnd,
          slotDurationMin: settings.slotDurationMin,
          workingDays: settings.workingDays,
        }
      : fallbackSettings,
    existingAppointments,
    now,
    blockedWindow: null,
  });
}

async function handleDateSelection(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();

  if (input === "0" || input === "voltar" || input === "menu") {
    session.stage = "ETAPA2_MAIN_MENU";
    const wctx = await loadWhatsAppCatalog(true);
    const prompts = await loadPromptMap();
    responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
    return responses;
  }

  if (input === "hoje") {
    // Use test date if available, otherwise use current date
    const today = session.testDate ? new Date(session.testDate) : new Date();
    if (today.getDay() === 0) {
      responses.push({ text: "❌ Domingo fechamos. " });
      const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
      responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
      return responses;
    }
    const dateStr = format(today, "yyyy-MM-dd");
    const slots = await getDynamicTimeSlots(session, dateStr);
    session.selectedDay = today.toLocaleDateString("pt-BR");
    session.selectedDateIso = dateStr;
    session.availableSlots = slots;
    session.stage = "ETAPA7_TIME";
    const optionsText = slots.length > 0 ? slots.map((time, i) => `*${i + 1}* - ${time}`).join("\n") : "Sem horários disponíveis";
    responses.push({ text: `📅 *Hoje* (${today.toLocaleDateString("pt-BR")})\n\n⏰ Qual horário?\n\n${optionsText}` });
    return responses;
  }

  const dayNum = parseInt(input);
  if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
    // Use test date if available, otherwise use current date
    const today = session.testDate ? new Date(session.testDate) : new Date();
    const selectedDate = new Date(today.getFullYear(), today.getMonth(), dayNum);
    
    // Check if date is in the past
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const selectedMidnight = new Date(today.getFullYear(), today.getMonth(), dayNum);
    if (selectedMidnight < todayMidnight) {
      responses.push({ text: "❌ Não é possível agendar para datas passadas. Por favor, escolha uma data a partir de hoje." });
      const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
      responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
      return responses;
    }
    
    if (selectedDate.getDay() === 0) {
      responses.push({ text: "❌ Domingo fechamos. " });
      const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
      responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
      return responses;
    }
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const slots = await getDynamicTimeSlots(session, dateStr);
    session.selectedDay = selectedDate.toLocaleDateString("pt-BR");
    session.selectedDateIso = dateStr;
    session.availableSlots = slots;
    session.stage = "ETAPA7_TIME";
    const optionsText = slots.length > 0 ? slots.map((time, i) => `*${i + 1}* - ${time}`).join("\n") : "Sem horários disponíveis";
    responses.push({ text: `📅 ${selectedDate.toLocaleDateString("pt-BR", { weekday: "long" })}\n\n⏰ Horários?\n\n${optionsText}` });
    return responses;
  }

  responses.push({ text: "❌ Opção inválida. Digite o número do dia ou 'menu' para voltar." });
  const calendarImagePath = await generateCalendarImageOnlyForTest(session.testDate || null);
  responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });
  return responses;
}

async function handleTimeSelection(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  if (input === "0" || input === "voltar" || input === "menu") {
    session.stage = "ETAPA2_MAIN_MENU";
    const wctx = await loadWhatsAppCatalog(true);
    const prompts = await loadPromptMap();
    responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
    return responses;
  }

  const fallbackSlots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];
  const slots = (session.availableSlots ?? []).length > 0 ? session.availableSlots ?? [] : fallbackSlots;
  const chosen = parseTimeSelection(message, slots);

  if (!chosen) {
    const looksLikeTimeAttempt = /^\d+$/.test(message.trim()) || /\d{1,2}[:h]\d{2}/.test(message.trim());
    if (looksLikeTimeAttempt) {
      responses.push({ text: `❌ Esse horário não está disponível. Escolha um dos horários abaixo:\n\n${slots.map((slot, index) => `*${index + 1}* - ${slot}`).join("\n")}` });
      return responses;
    }

    responses.push({ text: "❌ Não entendi. Escolha um horário válido da lista. " });
    return responses;
  }

  session.selectedTime = chosen;

  // Fluxo normal: sempre vai para pagamento após selecionar horário
  session.stage = "ETAPA8_PAYMENT";
  responses.push({ text: `⏰ *${chosen}* — ótimo! ` });
  responses.push({ text: buildPaymentOptionsText() });
  return responses;
}

async function handleReminderStep(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const isYes = normalizeYes(input);
  const isNo = normalizeNo(input);
  
  console.log("[handleReminderStep] Input:", input, "isYes:", isYes, "isNo:", isNo);
  
  if (isYes) {
    session.reminderPreference = "30min";
    console.log("[handleReminderStep] Set reminderPreference to 30min");
  } else if (isNo) {
    session.reminderPreference = "none";
    console.log("[handleReminderStep] Set reminderPreference to none");
  } else {
    responses.push({ text: "❌ Opção inválida. Por favor, escolha *1* para sim ou *2* para não." });
    return responses;
  }
  
  console.log("[handleReminderStep] reminderPreference after set:", session.reminderPreference);

  // Após lembrete, vai para pagamento (não direto para confirmação)
  session.stage = "ETAPA8_PAYMENT";
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

  const input = message.trim();
  if (/^(coupon|cupom|desconto)$/i.test(input)) {
    session.stage = "ETAPA9_COUPON";
    responses.push({ text: "🎟️ Você tem algum cupom de desconto?\n\n*1* Sim, tenho um cupom\n*2* Não tenho" });
    return responses;
  }

  if (!paymentMethods[input]) {
    responses.push({ text: "❌ Forma inválida. " });
    return responses;
  }

  session.paymentMethod = paymentMethods[input];

  // If PIX selected, show choice between now and delivery
  if (session.paymentMethod === "PIX") {
    session.stage = "ETAPA8_PIX_CHOICE";
    const prompts = await loadPromptMap();
    responses.push({ text: etapa8PixChoice(prompts) });
    return responses;
  }

  session.stage = "ETAPA9_REMINDER";

  responses.push({
    text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
  });
  return responses;
}

async function handlePixChoice(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const input = message.trim().toLowerCase();
  const prompts = await loadPromptMap();
  const ctx = await loadPaymentContext();

  if (input === "1" || /agora|pagar agora|imediato/i.test(input)) {
    // PIX agora - precisa enviar comprovante
    session.pixPaymentType = "now";
    session.paymentMethod = "PIX (Pagar agora)";
    const totalValue = Number(session.quote ?? 0) + Number(session.upsellValue ?? 0) + Number(session.pickupDeliveryFee ?? 0) - Number(session.couponDiscount ?? 0);
    const currentPaid = session.totalPaid ?? 0;
    const remainingValue = totalValue - currentPaid;

    // Reset payment state if starting fresh
    if (currentPaid === 0) {
      session.totalPaid = 0;
      session.partialPayments = [];
    }

    session.stage = "ETAPA8_RECEIPT_UPLOAD";
    session.awaitingReceiptUpload = true;

    // Enviar QR Code e pedir comprovante
    try {
      let pixQrUrl: string;

      // Se tiver QR Code pré-gerado, usa ele. Caso contrário, gera um novo.
      if (ctx.pixQrCodeImage) {
        pixQrUrl = ctx.pixQrCodeImage;
      } else {
        pixQrUrl = await generatePixQrCode({
          amount: remainingValue,
          description: `Agendamento ${session.selectedServiceName}`,
          merchantName: ctx.pixHolder || ctx.businessName,
          merchantCity: ctx.pixMerchantCity || ctx.address?.split(',').pop()?.trim() || "Sao Paulo",
          key: ctx.pixKey || "",
        });
      }

      const pixPayload = generatePixPayload({
        amount: remainingValue,
        description: `Agendamento ${session.selectedServiceName}`,
        merchantName: ctx.pixHolder || ctx.businessName,
        merchantCity: ctx.pixMerchantCity || ctx.address?.split(',').pop()?.trim() || "Sao Paulo",
        key: ctx.pixKey || "",
      });

      responses.push({ text: `💳 **Pagamento via PIX**\n\nEscaneie o QR Code abaixo para pagar:\n\nValor: R$ ${remainingValue.toFixed(2).replace('.', ',')}` });
      responses.push({ text: "", mediaUrl: pixQrUrl, mediaType: "image" });
      responses.push({ text: `Ou copie e cole o código PIX:\n\`${pixPayload}\`` });
      responses.push({ text: etapa8ReceiptUpload(remainingValue, prompts) });
    } catch (error) {
      console.error("[handlePixChoice] Error generating PIX QR code:", error);
      responses.push({ text: etapa8ReceiptUpload(remainingValue, prompts) });
    }
    return responses;
  }

  if (input === "2" || /entrega|pagar na entrega|depois/i.test(input)) {
    // PIX na entrega - não precisa comprovante agora
    session.pixPaymentType = "delivery";
    session.paymentMethod = "PIX (Pagar na entrega)";
    session.stage = "ETAPA9_REMINDER";
    responses.push({ text: "Perfeito! Você pagará via PIX no dia do serviço." });
    responses.push({
      text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
    });
    return responses;
  }

  responses.push({ text: "❌ Opção inválida. Escolha *1* para PIX agora ou *2* para PIX na entrega." });
  return responses;
}

async function handleReceiptUpload(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const prompts = await loadPromptMap();
  const totalValue = Number(session.quote ?? 0) + Number(session.upsellValue ?? 0) + Number(session.pickupDeliveryFee ?? 0) - Number(session.couponDiscount ?? 0);

  // Verificar se mensagem contém URL de imagem (simulado no test-bot)
  if (message.match(/^(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i) ||
      message.includes("image") ||
      message.includes("media") ||
      message.includes("upload")) {

    const imageUrl = message;

    try {
      // Analisar comprovante usando IA
      const receiptAmount = await analyzeReceiptImage(imageUrl);

      if (receiptAmount === null) {
        // Erro na leitura
        const attempts = session.receiptValidationAttempts ?? 0;
        if (attempts >= 2) {
          // Muitas tentativas - voltar para métodos de pagamento
          session.stage = "ETAPA8_PAYMENT";
          session.receiptValidationAttempts = 0;
          session.awaitingReceiptUpload = false;
          responses.push({ text: "Não consegui ler o comprovante após várias tentativas. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
          return responses;
        }

        session.receiptValidationAttempts = (session.receiptValidationAttempts ?? 0) + 1;
        responses.push({ text: etapa8ReceiptError(prompts) });
        return responses;
      }

      // Validar valor contra o valor restante (não o total original)
      const currentPaid = session.totalPaid ?? 0;
      const remainingValue = totalValue - currentPaid;

      if (validateReceiptAmount(receiptAmount, remainingValue, 10)) {
        // Valor correto - aprovar pagamento
        session.receiptImageUrl = imageUrl;
        session.receiptAmount = receiptAmount;
        session.totalPaid = currentPaid + receiptAmount;
        session.receiptValidationAttempts = 0;
        session.awaitingReceiptUpload = false;
        session.stage = "ETAPA9_REMINDER";

        // Gerar recibo digital
        try {
          const receiptResult = await generateAndSendReceipt(
            "test-" + session.sessionId,
            session.sessionId || ""
          );
          if (receiptResult) {
            responses.push({
              text: `📄 *Recibo gerado!*\n\n` + receiptResult.receiptText,
            });
          }
        } catch (error) {
          testBotLogger.error("Erro ao gerar recibo", error as Error, { sessionId: session.sessionId });
        }

        responses.push({ text: `✅ *Pagamento confirmado!*\n\nValor do comprovante: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${session.totalPaid.toFixed(2).replace('.', ',')}\n\nSeu agendamento está garantido.` });
        responses.push({
          text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
        });
        return responses;
      } else {
        // Valor incorreto - verificar se é pagamento parcial
        const newTotalPaid = currentPaid + receiptAmount;
        const remaining = totalValue - newTotalPaid;

        if (receiptAmount > 0 && remaining > 0) {
          // Pagamento parcial válido
          session.partialPayments = session.partialPayments || [];
          session.partialPayments.push({ amount: receiptAmount, imageUrl });
          session.totalPaid = newTotalPaid;
          session.receiptValidationAttempts = 0;

          responses.push({ text: `💰 *Pagamento parcial registrado!*\n\nValor recebido: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${newTotalPaid.toFixed(2).replace('.', ',')}\n*Falta pagar: R$ ${remaining.toFixed(2).replace('.', ',')}*\n\nPor favor, envie o comprovante do valor restante de R$ ${remaining.toFixed(2).replace('.', ',')}.` });
          responses.push({ text: etapa8ReceiptUpload(remaining, prompts) });
          return responses;
        } else if (receiptAmount > 0 && remaining <= 0) {
          // Pagamento completo com comprovante maior (aceitar)
          session.receiptImageUrl = imageUrl;
          session.receiptAmount = newTotalPaid;
          session.totalPaid = newTotalPaid;
          session.receiptValidationAttempts = 0;
          session.awaitingReceiptUpload = false;
          session.stage = "ETAPA9_REMINDER";

          // Gerar recibo digital
          try {
            const receiptResult = await generateAndSendReceipt(
              "test-" + session.sessionId,
              session.sessionId || ""
            );
            if (receiptResult) {
              responses.push({
                text: `📄 *Recibo gerado!*\n\n` + receiptResult.receiptText,
              });
            }
          } catch (error) {
            testBotLogger.error("Erro ao gerar recibo", error as Error, { sessionId: session.sessionId });
          }

          responses.push({ text: `✅ *Pagamento confirmado!*\n\nValor do comprovante: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${newTotalPaid.toFixed(2).replace('.', ',')}\n\nSeu agendamento está garantido.` });
          responses.push({
            text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
          });
          return responses;
        } else {
          // Valor incorreto
          const attempts = session.receiptValidationAttempts ?? 0;
          if (attempts >= 2) {
            // Muitas tentativas - voltar para métodos de pagamento
            session.stage = "ETAPA8_PAYMENT";
            session.receiptValidationAttempts = 0;
            session.awaitingReceiptUpload = false;
            responses.push({ text: "O valor do comprovante não confere após várias tentativas. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
            return responses;
          }

          session.receiptValidationAttempts = (session.receiptValidationAttempts ?? 0) + 1;
          responses.push({ text: etapa8ReceiptInvalid(remainingValue, receiptAmount, prompts) });
          responses.push({ text: etapa8ReceiptUpload(remainingValue, prompts) });
          return responses;
        }
      }
    } catch (error) {
      console.error("[handleReceiptUpload] Error analyzing receipt:", error);
      const attempts = session.receiptValidationAttempts ?? 0;
      if (attempts >= 2) {
        session.stage = "ETAPA8_PAYMENT";
        session.receiptValidationAttempts = 0;
        session.awaitingReceiptUpload = false;
        responses.push({ text: "Erro ao processar comprovante. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
        return responses;
      }

      session.receiptValidationAttempts = (session.receiptValidationAttempts ?? 0) + 1;
      responses.push({ text: etapa8ReceiptError(prompts) });
      return responses;
    }
  }

  // Se não for imagem, pedir novamente
  responses.push({ text: etapa8ReceiptUpload(totalValue, prompts) });
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
    session.stage = "ETAPA11_RATING";
    responses.push({
      text: `✅ *Tudo certo, ${session.customerName ?? "Cliente"}!*. 🎉\n\nSeu horário tá garantido — mal podemos esperar pra deixar seu carro brilhando. ✨\n\n📍 *Rua das Oficinas, 100 - SP*\n🕐 *Seg a Sáb, 08:00 às 18:00*\n\n📌 *Cancelamento até 2h antes sem custo.*\n📩 *Confirmação do agendamento será enviada 2h antes do horário.*\n\n─────────────────\n⭐ **Avaliação pós-serviço**\n\nGostou do atendimento? Avalie de 1 a 5!\n\n*1* - ⭐\n*2* - ⭐⭐\n*3* - ⭐⭐⭐\n*4* - ⭐⭐⭐⭐\n*5* - ⭐⭐⭐⭐⭐`,
    });
    return responses;
  }

  responses.push({ text: "Sem problemas! Alterar algo? " });
  resetSessionForNewStart(session);
  return responses;
}

async function handleRating(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  const rating = parseInt(message.trim(), 10);
  if (![1, 2, 3, 4, 5].includes(rating)) {
    responses.push({ text: "Por favor, avalie com um número de 1 a 5." });
    return responses;
  }

  recordTestBotRating(session.sessionId ?? "unknown", rating);
  responses.push({ text: `🙏 Obrigado pela sua avaliação de ${rating} estrelas! Sua opinião ajuda a melhorar nosso serviço.` });
  resetSessionForNewStart(session);
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

async function handleServiceQuestion(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  // Check if user is responding to AI answer
  if (!session.awaitingServiceQuestion) {
    const choice = message.trim();
    if (choice === "1") {
      // Back to service action to schedule
      session.stage = "ETAPA3_SERVICE_ACTION";
      const prompts = await loadPromptMap();
      const wctx = await loadWhatsAppCatalog(true);
      const serviceKey = session.selectedSubService ?? session.selectedService;
      const service = serviceKey ? wctx.catalog[serviceKey] : null;
      if (service) {
        const description = serviceDetail(service, prompts);
        responses.push({ text: description });
      }
      responses.push({
        text: "Como deseja prosseguir?\n\n*1* 📅 Agendar agora\n*2* 🔄 Ver outros\n*3* 💬 Tenho dúvidas",
      });
      return responses;
    } else if (choice === "2") {
      // Back to main menu
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const prompts = await loadPromptMap();
      responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
      return responses;
    } else if (choice === "3") {
      // More questions
      session.awaitingServiceQuestion = true;
      responses.push({ text: "📝 Qual sua próxima dúvida sobre o serviço? " });
      return responses;
    }
  }

  const userQuestion = message.trim();
  
  if (userQuestion.length < 5) {
    responses.push({ text: "⚠️ A pergunta é muito curta. Por favor, seja mais específico sobre sua dúvida, ou digite 'menu' para voltar." });
    return responses;
  }

  try {
    const wctx = await loadWhatsAppCatalog(true);
    const ctx = await loadPaymentContext();
    
    // Get service details
    const serviceKey = session.selectedSubService ?? session.selectedService;
    const service = serviceKey ? wctx.catalog[serviceKey] : null;
    const serviceName = session.selectedServiceName || "o serviço selecionado";
    const serviceDescription = service ? service.label : serviceName;
    
    const aiResponse = await answerCustomerDoubt({
      question: `Dúvida sobre o serviço "${serviceName}": ${userQuestion}. 
      
      Detalhes do serviço: ${serviceDescription}`,
      flow: {
        serviceLabel: serviceName,
        estimatedTime: service?.time || null,
        quoteMin: service?.hatchMin || null,
        quoteMax: service?.hatchMax || null,
        vehicleCondition: session.vehicle.condition,
      } as any,
      ctx,
      wctx,
    });

    if (aiResponse) {
      responses.push({ text: `🤖 *Resposta:*${aiResponse}` });
      responses.push({ text: "\n\n*1* - Voltar e agendar\n*2* - Ver outros serviços\n*3* - Mais dúvidas" });
      session.awaitingServiceQuestion = false;
      session.stage = "ETAPA11_SERVICE_QUESTION";
    } else {
      responses.push({ text: "😕 Não consegui responder sua dúvida. Por favor, tente reformular ou digite 'menu' para voltar." });
      session.stage = "ETAPA2_MAIN_MENU";
    }
  } catch (err) {
    console.error("[test-bot] Error in service question:", err);
    responses.push({ text: "😕 Ocorreu um erro ao processar sua dúvida. Por favor, digite 'menu' para voltar." });
    session.stage = "ETAPA2_MAIN_MENU";
  }

  return responses;
}

async function handleFAQ(
  message: string,
  session: TestSession,
  responses: TestResponse[]
): Promise<TestResponse[]> {
  // Check if this is the first interaction (asking for description)
  if (!session.awaitingServiceRecommendation) {
    session.awaitingServiceRecommendation = true;
    responses.push({ text: "🤔 Descreva em texto livre o que você precisa ou está procurando para o seu carro (ex: 'preciso de limpeza interna', 'tem manchas no estofado', 'quer dar brilho na pintura')." });
    return responses;
  }

  // Check if user is responding to AI recommendation (1 = schedule, 2 = menu)
  if (session.serviceRecommendation) {
    const choice = message.trim();
    if (choice === "1") {
      // User wants to schedule with recommended service
      // Extract service name from AI response and try to find it in catalog
      const wctx = await loadWhatsAppCatalog(true);
      const aiResponse = session.serviceRecommendation.toLowerCase();
      
      // Try to find a matching service in the catalog
      let matchedService: any = null;
      
      // First, try to extract service name if AI response starts with "Recomendo:"
      const recommendedMatch = aiResponse.match(/recomendo:?\s*([^.:—–-]+)/i);
      if (recommendedMatch) {
        const recommendedName = recommendedMatch[1].trim().toLowerCase().replace(/\*/g, '');
        for (const [catalogKey, service] of Object.entries(wctx.catalog)) {
          const serviceName = service.label.toLowerCase();
          // Check for partial match (at least 3 characters)
          if (recommendedName.length >= 3 && (serviceName.includes(recommendedName) || recommendedName.includes(serviceName.substring(0, recommendedName.length)))) {
            const { key: _, ...serviceWithoutKey } = service;
            matchedService = { key: catalogKey, ...serviceWithoutKey };
            break;
          }
        }
      }
      
      // If no match with extracted name, try fuzzy match on full response
      if (!matchedService) {
        for (const [catalogKey, service] of Object.entries(wctx.catalog)) {
          const serviceName = service.label.toLowerCase();
          // Check if service name appears in AI response or vice versa
          if (aiResponse.includes(serviceName) || (serviceName.length >= 5 && aiResponse.includes(serviceName.substring(0, 5)))) {
            const { key: _, ...serviceWithoutKey } = service;
            matchedService = { key: catalogKey, ...serviceWithoutKey };
            break;
          }
        }
      }
      
      // Last resort: try to match by keywords
      if (!matchedService) {
        const keywords = aiResponse.split(/\s+/).filter((w: string) => w.length >= 4);
        for (const [catalogKey, service] of Object.entries(wctx.catalog)) {
          const serviceName = service.label.toLowerCase();
          const hasKeyword = keywords.some((k: string) => serviceName.includes(k) || k.includes(serviceName.substring(0, k.length)));
          if (hasKeyword) {
            const { key: _, ...serviceWithoutKey } = service;
            matchedService = { key: catalogKey, ...serviceWithoutKey };
            break;
          }
        }
      }
      
      if (matchedService) {
        session.selectedSubService = matchedService.key;
        session.selectedServiceName = matchedService.label;
        session.serviceRecommendation = null;
        session.stage = "ETAPA3_SERVICE_ACTION";
        const prompts = await loadPromptMap();
        const description = serviceDetail(matchedService, prompts);
        responses.push({ text: description });
        responses.push({
          text: "Como deseja prosseguir?\n\n*1* 📅 Agendar agora\n*2* 🔄 Ver outros\n*3* 💬 Tenho dúvidas",
        });
        return responses;
      } else {
        // Couldn't find exact match, go to menu
        responses.push({ text: "Não consegui identificar o serviço específico. Por favor, selecione a categoria desejada no menu principal." });
        session.serviceRecommendation = null;
        session.stage = "ETAPA2_MAIN_MENU";
        const prompts = await loadPromptMap();
        responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
        return responses;
      }
    } else if (choice === "2") {
      // User wants to go back to menu
      session.serviceRecommendation = null;
      session.stage = "ETAPA2_MAIN_MENU";
      const wctx = await loadWhatsAppCatalog(true);
      const prompts = await loadPromptMap();
      responses.push({ text: etapa2MainMenu(session.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
      return responses;
    } else {
      // Invalid choice, show options again
      responses.push({ text: "Por favor, escolha uma opção:\n\n*1* - Agendar com o serviço recomendado\n*2* - Voltar ao menu principal" });
      return responses;
    }
  }

  // User provided description - use AI to recommend service
  session.awaitingServiceRecommendation = false;
  const userDescription = message.trim();
  
  if (userDescription.length < 10) {
    responses.push({ text: "⚠️ A descrição é muito curta. Por favor, seja mais específico sobre o que você precisa, ou digite 'menu' para ver as categorias disponíveis." });
    session.stage = "ETAPA2_MAIN_MENU";
    return responses;
  }

  try {
    const wctx = await loadWhatsAppCatalog(true);
    const ctx = await loadPaymentContext();
    
    // Build services list for context
    const servicesList = Object.entries(wctx.catalog)
      .map(([key, service]: [string, any]) => `${service.label} (R$ ${service.hatchMin || 'a consultar'})`)
      .join(', ');
    
    const aiResponse = await answerCustomerDoubt({
      question: `Preciso de ajuda para escolher um serviço. Descrição do que preciso: ${userDescription}. 
      
      Serviços disponíveis: ${servicesList}
      
      Por favor, recomende APENAS UM serviço específico da lista acima que melhor se encaixa na descrição do cliente. 
      Responda de forma direta: "Recomendo: [Nome do Serviço] - [breve explicação de 1 frase]".
      NÃO mencione "falar com o dono", NÃO peça para o cliente falar com alguém.
      Se não conseguir identificar um serviço claro, responda: "Não consegui identificar um serviço específico."`,
      flow: {
        serviceLabel: null,
        estimatedTime: null,
        quoteMin: null,
        quoteMax: null,
        vehicleCondition: session.vehicle.condition,
      } as any,
      ctx,
      wctx,
    });

    if (aiResponse) {
      session.serviceRecommendation = aiResponse;
      responses.push({ text: `🤖 *Recomendação da IA:*${aiResponse}` });
      responses.push({ text: "\n\n*1* - Agendar com o serviço recomendado\n*2* - Voltar ao menu principal" });
      session.stage = "ETAPA10_FAQ";
    } else {
      responses.push({ text: "😕 Não consegui identificar um serviço adequado com essa descrição. Por favor, tente ser mais específico ou digite 'menu' para ver as categorias disponíveis." });
      session.stage = "ETAPA2_MAIN_MENU";
    }
  } catch (err) {
    console.error("[test-bot] Error in AI recommendation:", err);
    responses.push({ text: "😕 Ocorreu um erro ao processar sua solicitação. Por favor, digite 'menu' para ver as categorias disponíveis." });
    session.stage = "ETAPA2_MAIN_MENU";
  }

  return responses;
}

function buildPaymentOptionsText() {
  return "**Pagamento**\n\n*1* 💳 PIX\n*2* 💳 Cartão\n*3* 💵 Dinheiro";
}

function resetSessionForNewStart(session: TestSession) {
  session.stage = "ETAPA1_AWAITING_NAME";
  session.customerName = null;
  session.selectedService = null;
  session.selectedCategoryNumber = null;
  session.selectedSubService = null;
  session.selectedServiceName = null;
  session.couponCode = null;
  session.couponDiscount = null;
  session.vehiclePhotoAttached = false;
  session.vehiclePhotoUrl = null;
  session.vehicle = { model: null, year: null, color: null, condition: "normal" };
  session.quote = null;
  session.upsellOffer = null;
  session.selectedDay = null;
  session.selectedTime = null;
  session.paymentMethod = null;
  session.wantsReminder = null;
  session.upsellAccepted = false;
  session.upsellLabel = null;
  session.upsellValue = null;
  session.isReturningClient = false;
  session.savedVehicle = null;
  session.loyaltyPoints = 0;
  session.wantsPickupDelivery = null;
  session.pickupDeliveryFee = 0;
  session.pickupAddress = null;
  session.needsReturn = false;
  session.awaitingPickupAddress = false;
  session.awaitingReturnPreference = false;
  session.awaitingPhotoUpload = false;
}

// Exports for compatibility
export { buildVehicleCollectionPrompt, buildBudgetSummaryText, normalizeConditionValue, buildPaymentOptionsText };

