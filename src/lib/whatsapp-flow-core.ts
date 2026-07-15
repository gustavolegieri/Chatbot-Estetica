/**
 * Módulo Core do Fluxo WhatsApp
 * Funções puras compartilhadas entre whatsapp-flow.ts (produção) e test-bot-processor.ts (teste)
 * Cada função recebe um estado normalizado e devolve { responses, nextState }
 * 
 * Este módulo contém a lógica de negócio que deve ser idêntica em ambos os ambientes.
 */

import type { FlowState, FlowStage } from "./whatsapp-flow-types";
import { findCouponByCode, canRedeem } from "./coupons";
import { calculateDistance, calculatePickupFee } from "./maps";
import { normalizePhone } from "./utils";
import { answerCustomerDoubt } from "./whatsapp-ai";
import { loadWhatsAppCatalog } from "./whatsapp-service-catalog";
import { loadPromptMap } from "./bot-prompts";
import { prisma } from "./prisma";
import { etapa2MainMenu, serviceDetail, etapa8ReceiptUpload, etapa8ReceiptError, etapa8ReceiptInvalid } from "./whatsapp-flow-messages";
import { buildVehicleConfirmationPrompt } from "./flow-validation";
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from "./calendar-helper";
import { buildAvailableSlotsForDay, parseTimeSelection } from "./appointments";
import { generatePixQrCode, generatePixPayload } from "./pix-qr";
import { analyzeReceiptImage, validateReceiptAmount } from "./receipt-analyzer";
import { generateAndSendReceipt } from "./receipt-generator";
import { testBotLogger } from "./structured-logger";
import { detectCancellationIntent, detectCancellationReason, calculateDiscount, generateDiscountOfferMessage, saveDiscountOffer, isDiscountOfferValid } from "./cancellation-detector";
import { startFunnel, trackFunnelProgress, trackAbandonment, completeFunnel } from "./funnel-tracker";
import { recordTestBotRating } from "./test-bot-evaluation-store";
import { generateSummaryCard, generateSummaryText, SummaryCardData } from "./summary-card";
import { format } from "date-fns";
import { vehicleDisplayFromFlow } from "./whatsapp-vehicle-parse";
import { resolveValidCustomerName } from "./customer-name";

// Re-export FlowState for use in other modules
export type { FlowState, FlowStage };

// Interfaces para as funções compartilhadas
export interface FlowResponse {
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "document";
}

export interface FlowResult {
  responses: FlowResponse[];
  nextState: FlowState;
  shouldTrackFunnel?: boolean;
  funnelStage?: string;
}

/**
 * Normaliza resposta "sim" de diferentes formas
 */
export function normalizeYes(input: string): boolean {
  const yesPatterns = [
    /^(sim|s|1|yes|quero|ok|vamos|confirmo|agendar|aceito|bora|tá|estou|de acordo|positivo)$/i,
    /^(claro|certo|entendido|combina|boa|beleza|perfeito|sucesso)$/i,
  ];
  return yesPatterns.some(pattern => pattern.test(input));
}

/**
 * Normaliza resposta "não" de diferentes formas
 */
export function normalizeNo(input: string): boolean {
  const noPatterns = [
    /^(nao|não|n|2|no|cancelar|alterar|desistir|rejeito|negativo|nao quero|não quero|desculpe)$/i,
    /^(ops|esqueci|melhor depois|talvez|mais tarde|ainda não|ainda nao)$/i,
  ];
  return noPatterns.some(pattern => pattern.test(input));
}

/**
 * Verifica se deve pular prompt de cupom
 */
export function shouldSkipCouponPrompt(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return /^(2|nao|não|n|sem|pular|ignorar|nenhum|nao tenho|não tenho|sem cupom|sem desconto|nenhum cupom|nao tenho cupom|não tenho cupom)$/i.test(normalized);
}

/**
 * Verifica se é cliente pela primeira vez
 */
export async function isFirstTimeCustomer(phone: string): Promise<boolean> {
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

/**
 * Aplica bônus de primeira compra (cupom PRIMEIRA10)
 * ATENÇÃO: Esta função só deve ser chamada APÓS o orçamento ser calculado (state.quoteMin preenchido)
 * Se quoteMin for 0 ou undefined, o bônus não é aplicado (evita mensagem de desconto zerado)
 */
export async function applyFirstTimeDiscount(
  state: FlowState,
  phone: string,
  responses: FlowResponse[]
): Promise<FlowState> {
  if (state.couponCode) return state; // Já tem cupom aplicado

  // Guarda defensiva: só aplica bônus se quoteMin já foi calculado
  if (!state.quoteMin || state.quoteMin <= 0) {
    console.warn("[applyFirstTimeDiscount] quoteMin não preenchido ou zerado, adiando aplicação do bônus");
    return state;
  }

  const coupon = await findCouponByCode("PRIMEIRA10");
  if (coupon && coupon.active) {
    const discount = coupon.type === "percent"
      ? state.quoteMin * (Number(coupon.amount) / 100)
      : Number(coupon.amount);

    const newState = {
      ...state,
      couponCode: "PRIMEIRA10",
      couponDiscountApplied: discount,
      firstTimeBonusApplied: true,
      firstTimeBonusDiscount: discount,
    };

    responses.push({
      text: `🎁 *Bônus!* Primeira vez: 10% de desconto aplicado! (-R$ ${discount.toFixed(2).replace('.', ',')})`
    });

    return newState;
  }

  return state;
}

/**
 * Constrói texto de opções de pagamento
 */
export function buildPaymentOptionsText(): string {
  return "**Pagamento**\n\n*1* 💳 PIX\n*2* 💳 Cartão\n*3* 💵 Dinheiro";
}

/**
 * Verifica se veículo parece SUV
 */
export function isSuvLikeVehicle(model: string | null): boolean {
  if (!model) return false;
  const t = model.toLowerCase();
  return /suv|pickup|picape|van|camionete|4x4|hilux|ranger|s10|toro|compass|renegade|t-cross|creta|hrv|sw4/i.test(t);
}

/**
 * Normaliza valor de condição do veículo
 */
export function normalizeConditionValue(value: string): "excelente" | "bom" | "normal" | "ruim" {
  const t = value.toLowerCase().trim();
  if (!t) return "normal";
  if (/(excelente|novo|zero km|seminovo|otimo|ótimo)/.test(t)) return "excelente";
  if (/(bom|bom estado|pouco uso|bem|limpo)/.test(t)) return "bom";
  if (/(ruim|arranh|feio|sujei|muito sujo|mancha|oxida|opac|precisa de atenção|precisa de atencao|gasto|precisa)/.test(t)) {
    return "ruim";
  }
  return "normal";
}

/**
 * Calcula preço base do serviço
 * DEPRECATED: Esta função usa multiplicadores (+20% SUV, +8% estado ruim) em cima de service.price.
 * A fonte de verdade para preços é o catálogo (whatsapp-catalog.ts e whatsapp-service-catalog.ts),
 * que já tem campos hatchMin/hatchMax/suvMin/suvMax diferenciando tipos de veículo.
 *
 * Esta função é mantida apenas para fallback quando o catálogo não está disponível,
 * mas o correto é usar os valores do catálogo diretamente (serviceToCatalogItem).
 *
 * TODO: Remover esta função e usar apenas o catálogo como fonte de verdade.
 */
export async function calculateBasePrice(
  serviceKey: string | null,
  vehicleModel: string | null,
  vehicleCondition: string | null
): Promise<number> {
  if (!serviceKey) return 75; // Fallback

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
      const isSuv = isSuvLikeVehicle(vehicleModel);
      const isBad = vehicleCondition === "ruim";
      let basePrice = Number(service.price);

      if (isSuv) basePrice = Math.round(basePrice * 1.2);
      if (isBad) basePrice = Math.round(basePrice * 1.08);

      return basePrice;
    }
  } catch (err) {
    console.error("[calculateBasePrice] Error:", err);
  }

  // Fallback hardcoded
  const isSuv = isSuvLikeVehicle(vehicleModel);
  const isBad = vehicleCondition === "ruim";
  return isSuv ? (isBad ? 130 : 110) : (isBad ? 85 : 75);
}

/**
 * Constrói texto de resumo de orçamento
 */
export function buildBudgetSummaryText(params: {
  serviceLabel?: string | null;
  serviceValue?: number | null;
  complementValue?: number | null;
  couponDiscount?: number | null;
  loyaltyDiscount?: number | null;
  pickupFee?: number | null;
  totalValue?: number | null;
}): string {
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

/**
 * Handler para reconhecimento de cliente recorrente
 */
export async function handleClientRecognition(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  const wantsRepeat = /^(sim|s|1)$/i.test(input);

  if (wantsRepeat && state.savedVehicle) {
    // Auto-usar veículo salvo
    const newState: FlowState = {
      ...state,
      vehicleModel: "Honda Civic",
      vehicleYear: "2020",
      vehicleColor: "preto",
      vehicleCondition: "bom",
      stage: "ETAPA4_VEHICLE_CONFIRM",
    };
    
    responses.push({ 
      text: buildVehicleConfirmationPrompt({ 
        model: "Honda Civic", 
        year: "2020", 
        color: "preto", 
        condition: "bom" 
      }) 
    });
    
    return { responses, nextState: newState };
  }

  // Voltar ao menu principal
  const newState: FlowState = {
    ...state,
    stage: "ETAPA2_MAIN_MENU",
  };
  
  const wctx = await loadWhatsAppCatalog(true);
  const prompts = await loadPromptMap();
  const menuText = etapa2MainMenu(
    state.customerName || "Cliente", 
    buildMainMenu(wctx.categories, prompts), 
    prompts
  );
  responses.push({ text: menuText });
  
  return { responses, nextState: newState };
}

/**
 * Handler para etapa de pontos de fidelidade
 */
export async function handleLoyaltyStep(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  const usePoints = /^(sim|s|1)$/i.test(input);

  let loyaltyDiscount = 0;
  if (usePoints && state.loyaltyPoints && state.loyaltyPoints > 0) {
    loyaltyDiscount = state.loyaltyPoints >= 100 ? 10 : 0;
    responses.push({ text: "🌟 Desconto aplicado!" });
  } else {
    responses.push({ text: "Sem problemas!" });
  }

  const newState: FlowState = {
    ...state,
    loyaltyPoints: usePoints ? 0 : state.loyaltyPoints,
    loyaltyDiscountApplied: loyaltyDiscount, // Persistir o desconto para uso posterior
    stage: "ETAPA10_BUDGET",
  };

  // Mostrar orçamento
  const baseQuote = Number(state.quoteMin ?? 0);
  const complementValue = Number(state.upsellValue ?? 0);
  const couponDiscount = Number(state.couponDiscountApplied ?? 0);
  const pickupFee = Number(state.pickupFee ?? 0);
  const totalValue = baseQuote + complementValue + pickupFee - couponDiscount - loyaltyDiscount;

  responses.push({
    text: buildBudgetSummaryText({
      serviceLabel: state.serviceLabel || "Serviço premium",
      serviceValue: baseQuote,
      complementValue,
      couponDiscount,
      loyaltyDiscount,
      pickupFee,
      totalValue,
    }),
  });
  responses.push({ text: "Quer agendar? (sim/não)" });

  return { responses, nextState: newState };
}

/**
 * Helper para parsear código de cupom do texto
 */
function parseCouponCodeFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // Exemplos: "cupom AA", "código AA", "tenho o AA", "usar AA", "AA"
  const m = t.match(/(?:cupom|c[oó]digo|c[oó]digo do|usar|tenho o|tenho um)\s*:?\s*([a-z0-9_-]{2,30})/i);
  if (m?.[1]) return m[1].toLowerCase();

  // Se o usuário mandar algo que parece só o código (ex: "aa")
  if (/^[a-z0-9_-]{2,30}$/i.test(t)) return t.toLowerCase();

  return null;
}

/**
 * Helper para aplicar cupom ao valor do orçamento
 */
function applyCouponToFlowValue(params: {
  coupon: any;
  flow: FlowState;
}): { flow: FlowState; discountApplied: number } {
  const { coupon, flow } = params;
  const baseMin = flow.quoteMin ?? 0;
  const baseMax = flow.quoteMax ?? 0;
  if (baseMin <= 0 && baseMax <= 0) {
    return { flow, discountApplied: 0 };
  }

  let newMin = baseMin;
  let newMax = baseMax;

  if (coupon.type === 'percent') {
    const pct = coupon.amount ?? 0;
    newMin = baseMin * (1 - pct / 100);
    newMax = baseMax * (1 - pct / 100);
  } else {
    const fixed = coupon.amount ?? 0;
    newMin = baseMin - fixed;
    newMax = baseMax - fixed;
  }

  const clampMoney = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.round(v * 100) / 100);
  };

  newMin = clampMoney(newMin);
  newMax = clampMoney(newMax);

  const discountApplied = clampMoney((baseMin + baseMax) / 2 - (newMin + newMax) / 2);

  return {
    flow: {
      ...flow,
      quoteMin: newMin,
      quoteMax: newMax,
      couponDiscountApplied: discountApplied,
    },
    discountApplied,
  };
}

/**
 * Handler para etapa de cupom
 */
export async function handleCouponStep(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  phone?: string
): Promise<FlowResult> {
  const input = message.trim();
  const skip = shouldSkipCouponPrompt(input);

  if (skip) {
    const newState: FlowState = {
      ...state,
      stage: "ETAPA9_LOYALTY",
    };
    responses.push({
      text: `🌟 *Pontos de Fidelidade*\n\nVocê tem ${state.loyaltyPoints ?? 0} pontos disponíveis.\n100 pontos = R$ 10 de desconto!\n\nQuer usar seus pontos agora?\n\n*1* - Sim, usar pontos\n*2* - Não, guardar para depois`,
    });
    return { responses, nextState: newState };
  }

  if (/^(1|sim|s|yes|tenho|com cupom)$/i.test(input)) {
    responses.push({ text: "Perfeito 😊 Me envie o *código do cupom* (ex: *AA*)." });
    return { responses, nextState: state };
  }

  const code = parseCouponCodeFromText(input);
  if (!code) {
    // Se usuário só perguntar "tenho cupom?", não tem código ainda
    if (/\b(cupom|c[oó]digo|desconto)\b/i.test(input) && !state.couponCode) {
      responses.push({ text: "Perfeito 😊 Me envie o *código do cupom* (ex: *AA*)." });
    }
    return { responses, nextState: state };
  }

  // Cliente precisa existir para validação de limite por cliente
  if (!phone) {
    responses.push({ text: "Erro: telefone não fornecido para validação de cupom." });
    return { responses, nextState: state };
  }

  const clientId = await prisma.client.findUnique({ where: { phone: normalizePhone(phone) } }).then((c) => c?.id);
  if (!clientId) {
    responses.push({ text: "Antes de usar cupom, confirme seu *nome* 😊" });
    return { responses, nextState: state };
  }

  const coupon = await findCouponByCode(code);
  if (!coupon || !coupon.active) {
    const newState: FlowState = {
      ...state,
      couponError: 'invalid_or_inactive',
      couponCode: code,
    };
    responses.push({ text: "Cupom inválido ou inativo 😔" });
    return { responses, nextState: newState };
  }

  // Validar regras (datas/limites/por cliente)
  const check = await canRedeem(coupon.id, clientId);
  if (!check.ok) {
    const newState: FlowState = {
      ...state,
      couponError: check.reason,
      couponCode: code,
    };
    responses.push({ text: `Não foi possível aplicar o cupom: ${check.reason}.` });
    return { responses, nextState: newState };
  }

  const applied = applyCouponToFlowValue({ coupon, flow: state });
  const newState: FlowState = {
    ...applied.flow,
    couponId: coupon.id,
    couponCode: code,
    couponError: undefined,
    stage: "ETAPA9_LOYALTY",
  };

  const formattedCouponCode = code.toUpperCase();
  const formattedDiscount = applied.discountApplied > 0 ? `*R$ ${applied.discountApplied.toFixed(2).replace(".", ",")}*` : "*sem valor fixo*";
  const finalValue = Math.max(0, (newState.quoteMin ?? 0));
  const formattedFinalValue = `*R$ ${finalValue.toFixed(2).replace(".", ",")}*`;

  responses.push({
    text: `✅ Cupom *${formattedCouponCode}* aplicado com sucesso!\n\n🎁 ${formattedCouponCode}\n💸 Desconto aplicado: ${formattedDiscount}\n💰 Valor final do agendamento: ${formattedFinalValue}`
  });
  responses.push({
    text: `🌟 *Pontos de Fidelidade*\n\nVocê tem ${state.loyaltyPoints ?? 0} pontos disponíveis.\n100 pontos = R$ 10 de desconto!\n\nQuer usar seus pontos agora?\n\n*1* - Sim, usar pontos\n*2* - Não, guardar para depois`,
  });

  return { responses, nextState: newState };
}

/**
 * Handler para etapa de lembrete (ETAPA14_REMINDER)
 */
export async function handleReminderStep(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  pushName?: string
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  const num = parseInt(input, 10);
  
  let reminderEnabled = false;
  let reminderPreference: "30min" | "1hour" | "1day" | "none" = "none";
  
  if (num === 1 || /sim|quero/i.test(input)) {
    reminderEnabled = true;
    reminderPreference = "30min"; // 30min default
  } else if (num === 2 || /nao|não|não precisa|não quero/i.test(input)) {
    reminderEnabled = false;
    reminderPreference = "none";
  } else {
    responses.push({ text: "Responda *1* para sim ou *2* para não." });
    return { responses, nextState: state };
  }
  
  const newState: FlowState = {
    ...state,
    reminderEnabled,
    reminderPreference,
    stage: "ETAPA15_SUMMARY_CONFIRM",
  };
  
  const totalValue = Math.max(0, Number(state.quoteMin ?? 0) + Number(state.pickupFee ?? 0) - Number(state.couponDiscountApplied ?? 0));
  const paymentMethod = state.paymentMethod || "—";
  const reminderText = reminderEnabled ? "sim" : "não";
  const pickupText = state.needsPickup ? "sim" : "não";
  const customerName = resolveValidCustomerName(state.customerName) ?? resolveValidCustomerName(pushName) ?? "Cliente";
  const serviceName = state.serviceLabel ?? "—";
  const vehicle = vehicleDisplayFromFlow(state) || "—";
  const date = state.dayLabel ?? state.dayDate ?? "—";
  const time = state.startTime ?? "—";
  const address = state.pickupAddress ?? "—";
  
  // Generate summary card image
  let summaryCardUrl = "";
  try {
    summaryCardUrl = await generateSummaryCard({
      customerName: customerName,
      serviceName: serviceName,
      vehicle: vehicle,
      date: date,
      time: time,
      paymentMethod: paymentMethod,
      totalPrice: totalValue,
      pickupAddress: address !== "—" ? address : undefined,
    });
  } catch (error) {
    console.error("[handleReminderStep] Error generating summary card:", error);
  }
  
  // Send text first
  const reminderTextFinal = reminderPreference === "none" ? "não" : reminderPreference || "—";
  const upsellLabel = state.upsellLabel ? `✨ + ${state.upsellLabel}` : "";
  const needsReturn = state.needsReturn ? "🔄 Devolução: sim" : "";
  
  const summaryLines = [
    "━━━━━━━━━━━━━━━",
    "📋 **RESUMO DO AGENDAMENTO**",
    `👤 ${customerName}`,
    `🧽 *${serviceName}*`,
    upsellLabel,
    `🚘 ${vehicle}`,
    `📅 ${date}`,
    `⏰ ${time}`,
    `🚚 Leva e traz: ${pickupText}`,
    address !== "—" ? `📍 Endereço: ${address}` : "",
    needsReturn,
    `💳 ${paymentMethod}`,
    `🔔 Lembrete: ${reminderTextFinal}`,
    `💰 **R$ ${totalValue.toFixed(2).replace(".", ",")}**`,
    "━━━━━━━━━━━━━━━",
    "",
    "⏱️ Cancelamento até 2h antes sem custo.",
    "",
    "✅ Confirma? (sim/não)",
  ];
  
  responses.push({ text: summaryLines.filter(Boolean).join("\n") });
  
  // Send image after text
  if (summaryCardUrl) {
    responses.push({ text: "", mediaUrl: summaryCardUrl, mediaType: "image" });
  }
  
  return { responses, nextState: newState };
}

/**
 * Handler para logística (pickup/leva-e-traz)
 * NOTA: Esta função NÃO inclui a etapa de cupom (ETAPA9_COUPON).
 * A ordem no fluxo atual é: ETAPA9_LOYALTY -> ETAPA10_BUDGET -> ETAPA10_LOGISTICS -> ETAPA7_DAY
 * O cupom foi movido para ser tratado no orçamento (ETAPA10_BUDGET) em vez de antes da logística.
 * Isso é uma mudança proposital em relação à produção original para simplificar o fluxo.
 */
export async function handleLogistics(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  const input = message.trim();
  const wantsDelivery = input === "2" || /^(busca|entrega|sim|delivery)$/i.test(input.toLowerCase());

  if (state.awaitingPickupAddress) {
    const address = input.trim();
    if (!address) {
      responses.push({ text: "📍 Me envie o endereço completo onde o carro está para calcular a taxa de busca." });
      return { responses, nextState: state };
    }

    const settings = await prisma.settings.findUnique({ where: { id: "default" } });
    const feePerKm = Number(settings?.pickupFeePerKm ?? 2.5);
    const feeBase = Number(settings?.pickupFeeBase ?? 0);
    const distance = await calculateDistance(address);
    const pickupFee = distance ? calculatePickupFee(distance.distanceKm, feePerKm, feeBase) : 0;

    const newState: FlowState = {
      ...state,
      pickupAddress: address,
      pickupFee,
      awaitingPickupAddress: false,
      awaitingReturnPreference: true,
    };

    responses.push({ 
      text: `📍 Endereço salvo.\n💰 Taxa de busca (R$ ${feePerKm.toFixed(2)}/km × ${distance?.distanceKm ?? 0} km): R$ ${pickupFee.toFixed(2)}\n\nQuer que devolvamos o veículo até você após o serviço?\n\n*1* Sim\n*2* Não` 
    });

    return { responses, nextState: newState };
  }

  if (state.awaitingReturnPreference) {
    const wantsReturn = /^(1|sim|s|quero|yes)$/i.test(input.toLowerCase());
    const newState: FlowState = {
      ...state,
      needsReturn: wantsReturn,
      awaitingReturnPreference: false,
      stage: "ETAPA7_DAY",
    };

    responses.push({ text: wantsReturn ? "🔄 Devolução incluída no resumo." : "📍 Sem devolução, tudo certo." });
    
    // Enviar calendário
    const calendarImagePath = await generateCalendarImageOnlyForTest(null);
    responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });

    return { responses, nextState: newState };
  }

  if (wantsDelivery) {
    const newState: FlowState = {
      ...state,
      needsPickup: true,
      awaitingPickupAddress: true,
      pickupFee: 0,
    };
    responses.push({ text: "🚚 Ótimo! Me envie o endereço completo onde o carro está para calcular a taxa de busca." });
    return { responses, nextState: newState };
  }

  const newState: FlowState = {
    ...state,
    needsPickup: false,
    pickupFee: 0,
    stage: "ETAPA7_DAY",
  };

  responses.push({ text: "📍 Combinado! Você pode levar o carro até a loja quando puder." });
  const calendarImagePath = await generateCalendarImageOnlyForTest(null);
  responses.push({ text: generateCalendarLegend(), mediaUrl: calendarImagePath, mediaType: "image" });

  return { responses, nextState: newState };
}

/**
 * Helper para construir menu principal
 */
function buildMainMenu(categories: Record<number, { title: string; keys: string[] }>, _prompts: any) {
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
}

/**
 * Handler para escolha de PIX (agora vs entrega)
 */
export async function handlePixChoice(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  const prompts = await loadPromptMap();
  const ctx = await loadPaymentContext();

  if (input === "1" || /agora|pagar agora|imediato/i.test(input)) {
    // PIX agora - precisa enviar comprovante
    const totalValue = Number(state.quoteMin ?? 0) + Number(state.upsellValue ?? 0) + Number(state.pickupFee ?? 0) - Number(state.couponDiscountApplied ?? 0) - Number(state.loyaltyDiscountApplied ?? 0);
    const currentPaid = state.totalPaid ?? 0;
    const remainingValue = totalValue - currentPaid;

    const newState: FlowState = {
      ...state,
      pixPaymentType: "now",
      paymentMethod: "PIX (Pagar agora)",
      stage: "ETAPA8_RECEIPT_UPLOAD",
      awaitingReceiptUpload: true,
      totalPaid: currentPaid === 0 ? 0 : currentPaid,
      partialPayments: currentPaid === 0 ? [] : state.partialPayments,
    };

    // Enviar QR Code
    try {
      let pixQrUrl: string;

      if (ctx.pixQrCodeImage) {
        pixQrUrl = ctx.pixQrCodeImage;
      } else {
        pixQrUrl = await generatePixQrCode({
          amount: remainingValue,
          description: `Agendamento ${state.serviceLabel}`,
          merchantName: ctx.pixHolder || ctx.businessName,
          merchantCity: ctx.pixMerchantCity || ctx.address?.split(',').pop()?.trim() || "Sao Paulo",
          key: ctx.pixKey || "",
        });
      }

      const pixPayload = generatePixPayload({
        amount: remainingValue,
        description: `Agendamento ${state.serviceLabel}`,
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

    return { responses, nextState: newState };
  }

  if (input === "2" || /entrega|pagar na entrega|depois/i.test(input)) {
    // PIX na entrega
    const newState: FlowState = {
      ...state,
      pixPaymentType: "delivery",
      paymentMethod: "PIX (Pagar na entrega)",
      stage: "ETAPA9_REMINDER",
    };

    responses.push({ text: "Perfeito! Você pagará via PIX no dia do serviço." });
    responses.push({
      text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
    });

    return { responses, nextState: newState };
  }

  responses.push({ text: "❌ Opção inválida. Escolha *1* para PIX agora ou *2* para PIX na entrega." });
  return { responses, nextState: state };
}

/**
 * Handler para upload de comprovante
 */
export async function handleReceiptUpload(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  sessionId?: string
): Promise<FlowResult> {
  const prompts = await loadPromptMap();
  const totalValue = Number(state.quoteMin ?? 0) + Number(state.upsellValue ?? 0) + Number(state.pickupFee ?? 0) - Number(state.couponDiscountApplied ?? 0) - Number(state.loyaltyDiscountApplied ?? 0);

  // Verificar se mensagem contém URL de imagem
  if (message.match(/^(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i) ||
      message.includes("image") ||
      message.includes("media") ||
      message.includes("upload")) {

    const imageUrl = message;

    try {
      const receiptAmount = await analyzeReceiptImage(imageUrl);

      if (receiptAmount === null) {
        const attempts = state.receiptValidationAttempts ?? 0;
        if (attempts >= 2) {
          const newState: FlowState = {
            ...state,
            stage: "ETAPA8_PAYMENT",
            receiptValidationAttempts: 0,
            awaitingReceiptUpload: false,
          };
          responses.push({ text: "Não consegui ler o comprovante após várias tentativas. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
          return { responses, nextState: newState };
        }

        const newState: FlowState = {
          ...state,
          receiptValidationAttempts: (state.receiptValidationAttempts ?? 0) + 1,
        };
        responses.push({ text: etapa8ReceiptError(prompts) });
        return { responses, nextState: newState };
      }

      const currentPaid = state.totalPaid ?? 0;
      const remainingValue = totalValue - currentPaid;

      if (validateReceiptAmount(receiptAmount, remainingValue, 10)) {
        // Valor correto
        const newState: FlowState = {
          ...state,
          receiptImageUrl: imageUrl,
          receiptAmount,
          totalPaid: currentPaid + receiptAmount,
          receiptValidationAttempts: 0,
          awaitingReceiptUpload: false,
          stage: "ETAPA9_REMINDER",
        };

        // Gerar recibo digital
        try {
          if (sessionId) {
            const receiptResult = await generateAndSendReceipt("test-" + sessionId, sessionId);
            if (receiptResult) {
              responses.push({
                text: `📄 *Recibo gerado!*\n\n` + receiptResult.receiptText,
              });
            }
          }
        } catch (error) {
          testBotLogger.error("Erro ao gerar recibo", error as Error, { sessionId });
        }

        responses.push({ text: `✅ *Pagamento confirmado!*\n\nValor do comprovante: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${(newState.totalPaid || 0).toFixed(2).replace('.', ',')}\n\nSeu agendamento está garantido.` });
        responses.push({
          text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
        });

        return { responses, nextState: newState };
      } else {
        // Valor incorreto - verificar pagamento parcial
        const newTotalPaid = currentPaid + receiptAmount;
        const remaining = totalValue - newTotalPaid;

        if (receiptAmount > 0 && remaining > 0) {
          // Pagamento parcial
          const newState: FlowState = {
            ...state,
            partialPayments: [...(state.partialPayments || []), { amount: receiptAmount, imageUrl }],
            totalPaid: newTotalPaid,
            receiptValidationAttempts: 0,
          };

          responses.push({ text: `💰 *Pagamento parcial registrado!*\n\nValor recebido: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${(newTotalPaid || 0).toFixed(2).replace('.', ',')}\n*Falta pagar: R$ ${remaining.toFixed(2).replace('.', ',')}*\n\nPor favor, envie o comprovante do valor restante de R$ ${remaining.toFixed(2).replace('.', ',')}.` });
          responses.push({ text: etapa8ReceiptUpload(remaining, prompts) });
          return { responses, nextState: newState };
        } else if (receiptAmount > 0 && remaining <= 0) {
          // Pagamento completo
          const newState: FlowState = {
            ...state,
            receiptImageUrl: imageUrl,
            receiptAmount: newTotalPaid,
            totalPaid: newTotalPaid,
            receiptValidationAttempts: 0,
            awaitingReceiptUpload: false,
            stage: "ETAPA9_REMINDER",
          };

          // Gerar recibo
          try {
            if (sessionId) {
              const receiptResult = await generateAndSendReceipt("test-" + sessionId, sessionId);
              if (receiptResult) {
                responses.push({
                  text: `📄 *Recibo gerado!*\n\n` + receiptResult.receiptText,
                });
              }
            }
          } catch (error) {
            testBotLogger.error("Erro ao gerar recibo", error as Error, { sessionId });
          }

          responses.push({ text: `✅ *Pagamento confirmado!*\n\nValor do comprovante: R$ ${receiptAmount.toFixed(2).replace('.', ',')}\nTotal pago: R$ ${(newTotalPaid || 0).toFixed(2).replace('.', ',')}\n\nSeu agendamento está garantido.` });
          responses.push({
            text: "🔔 Quer receber um lembrete 30 minutos antes do seu atendimento?\n\n*1* - Sim\n*2* - Não",
          });

          return { responses, nextState: newState };
        } else {
          // Valor incorreto
          const attempts = state.receiptValidationAttempts ?? 0;
          if (attempts >= 2) {
            const newState: FlowState = {
              ...state,
              stage: "ETAPA8_PAYMENT",
              receiptValidationAttempts: 0,
              awaitingReceiptUpload: false,
            };
            responses.push({ text: "O valor do comprovante não confere após várias tentativas. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
            return { responses, nextState: newState };
          }

          const newState: FlowState = {
            ...state,
            receiptValidationAttempts: (state.receiptValidationAttempts ?? 0) + 1,
          };
          responses.push({ text: etapa8ReceiptInvalid(remainingValue, receiptAmount, prompts) });
          responses.push({ text: etapa8ReceiptUpload(remainingValue, prompts) });
          return { responses, nextState: newState };
        }
      }
    } catch (error) {
      console.error("[handleReceiptUpload] Error analyzing receipt:", error);
      const attempts = state.receiptValidationAttempts ?? 0;
      if (attempts >= 2) {
        const newState: FlowState = {
          ...state,
          stage: "ETAPA8_PAYMENT",
          receiptValidationAttempts: 0,
          awaitingReceiptUpload: false,
        };
        responses.push({ text: "Erro ao processar comprovante. Vamos tentar outro método de pagamento.\n\n" + buildPaymentOptionsText() });
        return { responses, nextState: newState };
      }

      const newState: FlowState = {
        ...state,
        receiptValidationAttempts: (state.receiptValidationAttempts ?? 0) + 1,
      };
      responses.push({ text: etapa8ReceiptError(prompts) });
      return { responses, nextState: newState };
    }
  }

  // Se não for imagem, pedir novamente
  responses.push({ text: etapa8ReceiptUpload(totalValue, prompts) });
  return { responses, nextState: state };
}

/**
 * Handler para confirmação de resumo antes do agendamento final
 */
export async function handleSummaryConfirm(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  const isYes = /^(sim|s|1|yes|confirmo|agendar)$/i.test(input);

  if (isYes) {
    // User confirmed summary - proceed to final confirmation
    const newState: FlowState = {
      ...state,
      stage: "ETAPA16_CONFIRMATION",
    };

    responses.push({
      text: `✅ *Tudo certo, ${state.customerName ?? "Cliente"}!*. 🎉\n\nSeu horário tá garantido — mal podemos esperar pra deixar seu carro brilhando. ✨\n\n📍 *Rua das Oficinas, 100 - SP*\n🕐 *Seg a Sáb, 08:00 às 18:00*\n\n📌 *Cancelamento até 2h antes sem custo.*\n📩 *Confirmação do agendamento será enviada 2h antes do horário.*\n\n─────────────────\n⭐ **Avaliação pós-serviço**\n\nGostou do atendimento? Avalie de 1 a 5!\n\n*1* - ⭐\n*2* - ⭐⭐\n*3* - ⭐⭐⭐\n*4* - ⭐⭐⭐⭐\n*5* - ⭐⭐⭐⭐⭐`,
    });

    return { responses, nextState: newState };
  }

  responses.push({ text: "Sem problemas! Alterar algo?" });
  const resetState: FlowState = {
    ...state,
    stage: "ETAPA1_AWAITING_NAME",
    customerName: undefined,
  };
  return { responses, nextState: resetState };
}

/**
 * Handler para confirmação final (LEGACY - agora usa handleSummaryConfirm)
 * Esta função é mantida para compatibilidade, mas o fluxo correto é:
 * ETAPA15_SUMMARY_CONFIRM -> handleSummaryConfirm -> ETAPA16_CONFIRMATION -> handleRating
 */
export async function handleFinalConfirm(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  // Gera o resumo antes da confirmação final
  try {
    // Converter FlowState para SummaryCardData
    const summaryData: SummaryCardData = {
      customerName: state.customerName || "Cliente",
      serviceName: state.serviceLabel || "Serviço",
      vehicle: vehicleDisplayFromFlow(state) || "Veículo não informado",
      date: state.dayLabel || state.dayDate || "Data não informada",
      time: state.startTime || state.periodLabel || "Horário não informado",
      paymentMethod: state.paymentMethod || "Pagamento não informado",
      totalPrice: Math.max(0, Number(state.quoteMin ?? 0) + Number(state.pickupFee ?? 0) - Number(state.couponDiscountApplied ?? 0) - Number(state.loyaltyDiscountApplied ?? 0)),
      pickupAddress: state.pickupAddress,
    };

    const summaryText = generateSummaryText(summaryData);
    const summaryCard = await generateSummaryCard(summaryData);

    responses.push({ text: summaryText });
    if (summaryCard) {
      responses.push({ text: "", mediaUrl: summaryCard, mediaType: "image" });
    }
    responses.push({ text: "📋 *Resumo do agendamento*\n\nConfirme os dados acima:\n*1* - Sim, confirmar\n*2* - Não, alterar algo" });

    const newState: FlowState = {
      ...state,
      stage: "ETAPA15_SUMMARY_CONFIRM",
    };

    return { responses, nextState: newState };
  } catch (error) {
    console.error("[handleFinalConfirm] Error generating summary:", error);
    // Fallback: direto para confirmação sem resumo visual
    return handleSummaryConfirm(state, message, responses);
  }
}

/**
 * Handler para avaliação pós-atendimento
 */
export async function handleRating(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  sessionId?: string
): Promise<FlowResult> {
  const rating = parseInt(message.trim(), 10);
  if (![1, 2, 3, 4, 5].includes(rating)) {
    responses.push({ text: "Por favor, avalie com um número de 1 a 5." });
    return { responses, nextState: state };
  }

  if (sessionId) {
    recordTestBotRating(sessionId, rating);
  }

  responses.push({ text: `🙏 Obrigado pela sua avaliação de ${rating} estrelas! Sua opinião ajuda a melhorar nosso serviço.` });

  const resetState: FlowState = {
    ...state,
    stage: "ETAPA1_AWAITING_NAME",
    customerName: undefined,
  };

  return { responses, nextState: resetState };
}

/**
 * Carrega contexto de pagamento
 */
async function loadPaymentContext() {
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

/**
 * Handler para perguntas sobre serviço (dúvidas específicas)
 */
export async function handleServiceQuestion(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  // Check if user is responding to AI answer
  if (!state.awaitingServiceQuestion) {
    const choice = message.trim();
    if (choice === "1") {
      // Back to service action to schedule
      const newState: FlowState = {
        ...state,
        stage: "ETAPA3_SERVICE_ACTION",
        awaitingServiceQuestion: false,
      };
      
      const prompts = await loadPromptMap();
      const wctx = await loadWhatsAppCatalog(true);
      const serviceKey = state.serviceKey;
      const service = serviceKey ? wctx.catalog[serviceKey] : null;
      
      if (service) {
        const description = serviceDetail(service, prompts);
        responses.push({ text: description });
      }
      
      responses.push({
        text: "Como deseja prosseguir?\n\n*1* 📅 Agendar agora\n*2* 🔄 Ver outros\n*3* 💬 Tenho dúvidas",
      });
      
      return { responses, nextState: newState };
    } else if (choice === "2") {
      // Back to main menu
      const newState: FlowState = {
        ...state,
        stage: "ETAPA2_MAIN_MENU",
        awaitingServiceQuestion: false,
      };
      
      const wctx = await loadWhatsAppCatalog(true);
      const prompts = await loadPromptMap();
      responses.push({ text: etapa2MainMenu(state.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
      
      return { responses, nextState: newState };
    } else if (choice === "3") {
      // More questions
      const newState: FlowState = {
        ...state,
        awaitingServiceQuestion: true,
      };
      responses.push({ text: "📝 Qual sua próxima dúvida sobre o serviço?" });
      return { responses, nextState: newState };
    }
  }

  const userQuestion = message.trim();
  
  if (userQuestion.length < 5) {
    responses.push({ text: "⚠️ A pergunta é muito curta. Por favor, seja mais específico sobre sua dúvida, ou digite 'menu' para voltar." });
    return { responses, nextState: state };
  }

  try {
    const wctx = await loadWhatsAppCatalog(true);
    const ctx = await loadPaymentContext();
    
    // Get service details
    const serviceKey = state.serviceKey;
    const service = serviceKey ? wctx.catalog[serviceKey] : null;
    const serviceName = state.serviceLabel || "o serviço selecionado";
    const serviceDescription = service ? service.label : serviceName;
    
    const aiResponse = await answerCustomerDoubt({
      question: `Dúvida sobre o serviço "${serviceName}": ${userQuestion}. 
      
      Detalhes do serviço: ${serviceDescription}`,
      flow: {
        serviceLabel: serviceName,
        estimatedTime: service?.time || null,
        quoteMin: service?.hatchMin || null,
        quoteMax: service?.hatchMax || null,
        vehicleCondition: state.vehicleCondition,
      } as any,
      ctx,
      wctx,
    });

    if (aiResponse) {
      responses.push({ text: `🤖 *Resposta:*${aiResponse}` });
      responses.push({ text: "\n\n*1* - Voltar e agendar\n*2* - Ver outros serviços\n*3* - Mais dúvidas" });
      
      const newState: FlowState = {
        ...state,
        awaitingServiceQuestion: false,
        stage: "ETAPA11_SERVICE_QUESTION",
      };
      
      return { responses, nextState: newState };
    } else {
      responses.push({ text: "😕 Não consegui responder sua dúvida. Por favor, tente reformular ou digite 'menu' para voltar." });
      
      const newState: FlowState = {
        ...state,
        stage: "ETAPA2_MAIN_MENU",
        awaitingServiceQuestion: false,
      };
      
      return { responses, nextState: newState };
    }
  } catch (err) {
    console.error("[handleServiceQuestion] Error:", err);
    responses.push({ text: "😕 Ocorreu um erro ao processar sua dúvida. Por favor, digite 'menu' para voltar." });
    
    const newState: FlowState = {
      ...state,
      stage: "ETAPA2_MAIN_MENU",
      awaitingServiceQuestion: false,
    };
    
    return { responses, nextState: newState };
  }
}

/**
 * Handler para FAQ (recomendação de serviço por IA)
 */
export async function handleFAQ(
  state: FlowState,
  message: string,
  responses: FlowResponse[]
): Promise<FlowResult> {
  // Check if this is the first interaction (asking for description)
  if (!state.awaitingServiceRecommendation) {
    const newState: FlowState = {
      ...state,
      awaitingServiceRecommendation: true,
    };
    responses.push({ text: "🤔 Descreva em texto livre o que você precisa ou está procurando para o seu carro (ex: 'preciso de limpeza interna', 'tem manchas no estofado', 'quer dar brilho na pintura')." });
    return { responses, nextState: newState };
  }

  // Check if user is responding to AI recommendation (1 = schedule, 2 = menu)
  if (state.serviceRecommendation) {
    const choice = message.trim();
    if (choice === "1") {
      // User wants to schedule with recommended service
      const wctx = await loadWhatsAppCatalog(true);
      const aiResponse = state.serviceRecommendation.toLowerCase();
      
      // Try to find a matching service in the catalog
      let matchedService: any = null;
      
      // First, try to extract service name if AI response starts with "Recomendo:"
      const recommendedMatch = aiResponse.match(/recomendo:?\s*([^.:—–-]+)/i);
      if (recommendedMatch) {
        const recommendedName = recommendedMatch[1].trim().toLowerCase().replace(/\*/g, '');
        for (const [catalogKey, service] of Object.entries(wctx.catalog)) {
          const serviceName = service.label.toLowerCase();
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
        const newState: FlowState = {
          ...state,
          serviceKey: matchedService.key,
          serviceLabel: matchedService.label,
          serviceRecommendation: null,
          awaitingServiceRecommendation: false,
          stage: "ETAPA3_SERVICE_ACTION",
        };
        
        const prompts = await loadPromptMap();
        const description = serviceDetail(matchedService, prompts);
        responses.push({ text: description });
        responses.push({
          text: "Como deseja prosseguir?\n\n*1* 📅 Agendar agora\n*2* 🔄 Ver outros\n*3* 💬 Tenho dúvidas",
        });
        
        return { responses, nextState: newState };
      } else {
        // Couldn't find exact match, go to menu
        responses.push({ text: "Não consegui identificar o serviço específico. Por favor, selecione a categoria desejada no menu principal." });
        
        const newState: FlowState = {
          ...state,
          serviceRecommendation: null,
          awaitingServiceRecommendation: false,
          stage: "ETAPA2_MAIN_MENU",
        };
        
        const prompts = await loadPromptMap();
        responses.push({ text: etapa2MainMenu(state.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
        
        return { responses, nextState: newState };
      }
    } else if (choice === "2") {
      // User wants to go back to menu
      const newState: FlowState = {
        ...state,
        serviceRecommendation: null,
        awaitingServiceRecommendation: false,
        stage: "ETAPA2_MAIN_MENU",
      };
      
      const wctx = await loadWhatsAppCatalog(true);
      const prompts = await loadPromptMap();
      responses.push({ text: etapa2MainMenu(state.customerName || "Cliente", buildMainMenu(wctx.categories, prompts), prompts) });
      
      return { responses, nextState: newState };
    } else {
      // Invalid choice, show options again
      responses.push({ text: "Por favor, escolha uma opção:\n\n*1* - Agendar com o serviço recomendado\n*2* - Voltar ao menu principal" });
      return { responses, nextState: state };
    }
  }

  // User provided description - use AI to recommend service
  const userDescription = message.trim();
  
  if (userDescription.length < 10) {
    responses.push({ text: "⚠️ A descrição é muito curta. Por favor, seja mais específico sobre o que você precisa, ou digite 'menu' para ver as categorias disponíveis." });
    
    const newState: FlowState = {
      ...state,
      awaitingServiceRecommendation: false,
      stage: "ETAPA2_MAIN_MENU",
    };
    
    return { responses, nextState: newState };
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
        vehicleCondition: state.vehicleCondition,
      } as any,
      ctx,
      wctx,
    });

    if (aiResponse) {
      const newState: FlowState = {
        ...state,
        serviceRecommendation: aiResponse,
        awaitingServiceRecommendation: false,
      };
      
      responses.push({ text: `🤖 *Recomendação da IA:*${aiResponse}` });
      responses.push({ text: "\n\n*1* - Agendar com o serviço recomendado\n*2* - Voltar ao menu principal" });
      
      return { responses, nextState: newState };
    } else {
      responses.push({ text: "😕 Não consegui identificar um serviço adequado com essa descrição. Por favor, tente ser mais específico ou digite 'menu' para ver as categorias disponíveis." });
      
      const newState: FlowState = {
        ...state,
        awaitingServiceRecommendation: false,
        stage: "ETAPA2_MAIN_MENU",
      };
      
      return { responses, nextState: newState };
    }
  } catch (err) {
    console.error("[handleFAQ] Error:", err);
    responses.push({ text: "😕 Ocorreu um erro ao processar sua solicitação. Por favor, digite 'menu' para ver as categorias disponíveis." });
    
    const newState: FlowState = {
      ...state,
      awaitingServiceRecommendation: false,
      stage: "ETAPA2_MAIN_MENU",
    };
    
    return { responses, nextState: newState };
  }
}

/**
 * Handler para detecção de cancelamento e oferta de desconto
 * Esta função deve ser chamada ANTES do switch de etapas
 */
export async function handleCancellationDetection(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  phone: string,
  sessionId?: string
): Promise<FlowResult | null> {
  if (!detectCancellationIntent(message)) {
    return null; // Não é intenção de cancelamento
  }

  const reason = detectCancellationReason(message);
  const originalPrice = state.quoteMin || 100; // Valor estimado
  const offer = calculateDiscount(reason, originalPrice);

  responses.push({
    text: generateDiscountOfferMessage(
      state.customerName || "Cliente",
      originalPrice,
      offer
    ),
  });

  // Salvar oferta no banco
  if (phone) {
    await saveDiscountOffer(
      sessionId || phone,
      phone,
      originalPrice,
      offer.discountPercentage,
      new Date(Date.now() + offer.validForMinutes * 60 * 1000)
    );
  }

  // Adicionar estado de espera de resposta de desconto
  const newState: FlowState = {
    ...state,
    awaitingDiscountResponse: true,
    discountOffer: {
      originalPrice,
      discountPercentage: offer.discountPercentage,
      validUntil: new Date(Date.now() + offer.validForMinutes * 60 * 1000).toISOString(),
      used: false,
      discountReason: offer.discountReason,
    },
    discountOriginalPrice: originalPrice,
  };

  return { responses, nextState: newState };
}

/**
 * Handler para resposta à oferta de desconto
 */
export async function handleDiscountResponse(
  state: FlowState,
  message: string,
  responses: FlowResponse[],
  sessionId?: string
): Promise<FlowResult> {
  const input = message.trim().toLowerCase();
  
  if (input === "1" || /sim|quero|aceito|aprovei/i.test(input)) {
    // Aceitar desconto
    const offer = state.discountOffer;
    if (!offer) {
      // Se não tem oferta, voltar ao fluxo normal
      const newState: FlowState = {
        ...state,
        awaitingDiscountResponse: false,
      };
      return { responses, nextState: newState };
    }

    const discountedPrice = (state.discountOriginalPrice || 100) * (1 - offer.discountPercentage / 100);
    const newState: FlowState = {
      ...state,
      quoteMin: discountedPrice,
      awaitingDiscountResponse: false,
      discountOffer: undefined,
      discountOriginalPrice: undefined,
    };

    responses.push({
      text: `✅ Ótimo! ${offer.discountReason}\n\nNovo valor: R$ ${discountedPrice.toFixed(2).replace('.', ',')}\n\nVamos continuar o agendamento com este valor especial!`,
    });

    if (sessionId) {
      testBotLogger.info("Cliente aceitou oferta de desconto", { sessionId, discountPercentage: offer.discountPercentage });
    }

    return { responses, nextState: newState };
  } else if (input === "2" || /nao|não|cancelar|recusar/i.test(input)) {
    // Recusar desconto e cancelar
    const newState: FlowState = {
      ...state,
      awaitingDiscountResponse: false,
      discountOffer: undefined,
      discountOriginalPrice: undefined,
      stage: "ETAPA2_MAIN_MENU",
    };

    responses.push({
      text: "Entendido. Sem problemas! \n\nVoltamos ao menu principal. O que você gostaria de fazer?",
    });

    if (sessionId) {
      testBotLogger.info("Cliente recusou oferta de desconto", { sessionId });
    }

    return { responses, nextState: newState };
  }

  // Resposta inválida, manter no estado de espera
  responses.push({
    text: "Por favor, escolha uma opção:\n*1* - Sim, aproveitar o desconto\n*2* - Não, prefiro cancelar mesmo assim",
  });

  return { responses, nextState: state };
}

/**
 * Funções de Funnel Tracking (wrappers para funnel-tracker.ts)
 * Estas funções podem ser chamadas em pontos estratégicos do fluxo
 */

/**
 * Inicia o rastreamento do funil para uma nova sessão
 */
export async function initFunnelTracking(phone: string, sessionId?: string): Promise<void> {
  await startFunnel(sessionId || phone, phone);
}

/**
 * Registra progresso no funil
 */
export async function trackProgress(phone: string, stage: string, sessionId?: string): Promise<void> {
  await trackFunnelProgress(sessionId || phone, phone, stage);
}

/**
 * Registra abandono no funil
 */
export async function trackFunnelAbandonment(phone: string, reason: string, sessionId?: string): Promise<void> {
  await trackAbandonment(sessionId || phone, phone, reason);
}

/**
 * Marca o funil como concluído
 */
export async function markFunnelComplete(phone: string, sessionId?: string): Promise<void> {
  await completeFunnel(sessionId || phone, phone);
}
