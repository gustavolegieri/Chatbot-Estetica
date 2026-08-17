import { AppointmentStatus, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { renderPrompt } from "./bot-prompts";
import {
  sendText as sendTextRaw,
  sendMedia as sendMediaRaw,
} from "./evolution-api";
import {
  generateCalendarImageOnly,
  sendCalendarWithImageAndList as sendCalendarWithImageAndListRaw,
  generateCalendarLegend,
} from "./calendar-helper";
import {
  calculateEndTime,
  formatDurationLabel,
  generateAvailableSlots,
  overlapsExisting,
  parseTimeInput,
  parseTimeSelection,
  timeToMinutes,
} from "./appointments";
import { normalizePhone } from "./utils";
import {
  BRAND_DEFAULT,
  MAIN_MENU_CATEGORIES,
  UNDECIDED_TO_KEY,
  loadWhatsAppCatalog,
  buildMainMenu,
  subMenuForCategoryCtx,
  getUpsellForKey,
  type WhatsAppCatalogContext,
} from "./whatsapp-service-catalog";
import { resolveValidCustomerName } from "./customer-name";
import { requestHumanHandoff, wantsHumanHandoff } from "./whatsapp-handoff";
import {
  etapa1Welcome,
  etapa2MainMenu,
  etapa4Vehicle,
  etapa4VehicleConfirmation,
  etapa5Quote,
  etapa6Upsell,
  etapa7Day,
  etapa7NoSlots,
  etapa7Time,
  etapa8Payment,
  etapa8PixBlock,
  etapa8PixChoice,
  etapa8ReceiptUpload,
  etapa8ReceiptInvalid,
  etapa8ReceiptError,
  etapa9Confirm,
  etapa9Coupon,
  etapa9Loyalty,
  etapa10Budget,
  etapa10Logistics,
  etapa15SummaryConfirm,
  evaluationRequired,
  couponApplied,
  couponCodeRequest,
  firstTimeBonusApplied,
  firstTimeBonusDeclined,
  firstTimeBonusOffer,
  formatHours,
  handoffAcknowledgement,
  initialRequestSummary,
  initialScheduleNameRequest,
  indecisiveProblemPrompt,
  indecisiveVehiclePrompt,
  packageActionText,
  reminderChoice,
  invalidMenu,
  packageActionMenu,
  quotePitchForService,
  serviceActionMenu,
  serviceDetail,
  slotUnavailable,
  upsellAdded,
  upsellOffer,
  vehicleMissingDetails,
  vehicleNotUnderstood,
  type FlowContext,
} from "./whatsapp-flow-messages";
import {
  detectCategoryNum,
  detectServiceKey,
  isAvailabilityRequest,
  isGreetingOrSmallTalk,
  onlyMenuNumber,
  wantsDoubt,
  wantsOtherServices,
  wantsRefusal,
  wantsToSchedule,
} from "./whatsapp-intent";
import { isValidCustomerName } from "./flow-validation";
import {
  isValidVehicle,
  looksLikePersonName,
  parsePlateFromText,
  parseVehicleMessage,
  parseVehicleMessageSmart,
  parseYearFromText,
  vehicleDisplayFromFlow,
} from "./whatsapp-vehicle-parse";
import { FlowState } from "./whatsapp-flow-types";
import {
  normalizeYes,
  normalizeNo,
  shouldSkipCouponPrompt,
  isFirstTimeCustomer,
  applyFirstTimeDiscount,
  buildPaymentOptionsText,
  handleLoyaltyStep,
  handleLogistics,
  handlePixChoice,
  handleReceiptUpload,
  handleCouponStep,
  handleReminderStep,
  handleFinalConfirm,
  handleSummaryConfirm,
  handleRating,
  handleServiceQuestion,
  handleFAQ,
  handleCancellationDetection,
  handleDiscountResponse,
  calculateFlowTotal,
  initFunnelTracking,
  trackProgress,
  trackFunnelAbandonment,
  markFunnelComplete,
  type FlowResponse,
  type FlowResult,
} from "./whatsapp-flow-core";
import {
  analyzeWhatsAppMessage,
  answerCustomerDoubt,
  buildFriendlyFallback,
  looksLikeQuestion,
} from "./whatsapp-ai";
import { canRedeem, findCouponByCode } from "./coupons";


const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface IncomingMessage {
  phone: string;
  text: string;
  pushName?: string;
  initialWelcomePrefix?: string;
  initialWelcomeConsumed?: boolean;
  testMode?: {
    sendTextCallback?: (text: string, metadata?: { voiceReply?: boolean }) => Promise<void>;
    onFlowStateChange?: (flow: FlowState) => void;
    useRealAI?: boolean;
    skipDb?: boolean;
  };
}

/**
 * Mantém o modo de entrega vinculado à requisição atual. Assim, o mesmo motor
 * de fluxo atende produção e o simulador sem que o painel dispare mensagens
 * reais pela Wasender.
 */
const flowDeliveryContext = new AsyncLocalStorage<IncomingMessage["testMode"]>();

async function sendText(params: Parameters<typeof sendTextRaw>[0]) {
  const callback = flowDeliveryContext.getStore()?.sendTextCallback;
  if (callback) {
    await callback(params.text, { voiceReply: params.voiceReply });
    return { simulated: true };
  }
  return sendTextRaw(params);
}

async function sendMedia(params: Parameters<typeof sendMediaRaw>[0]) {
  const callback = flowDeliveryContext.getStore()?.sendTextCallback;
  if (callback) {
    const mediaType = params.mediaType ?? "image";
    await callback(`[MÍDIA: ${mediaType}|${params.mediaUrl}] ${params.caption ?? ""}`.trim());
    return { simulated: true };
  }
  return sendMediaRaw(params);
}

async function sendCalendarWithImageAndList(params: { number: string; prompts?: unknown }) {
  const callback = flowDeliveryContext.getStore()?.sendTextCallback;
  if (!callback) {
    return sendCalendarWithImageAndListRaw(params);
  }

  try {
    const imageUrl = await generateCalendarImageOnly();
    await callback(`[MÍDIA: image|${imageUrl}] ${generateCalendarLegend()}`);
  } catch (error) {
    console.warn("[WhatsApp Flow] Não foi possível gerar calendário para o simulador:", error);
    await callback(generateCalendarLegend());
  }

  // A orientação já acompanha a imagem. O simulador não repete a mesma
  // mensagem que, no WhatsApp real, aparece junto ao botão "Ver dias".
  return { simulated: true };
}

/**
 * Wrapper para sendText que suporta modo de teste
 */
async function sendTextWrapper(
  msg: IncomingMessage,
  text: string,
  options?: { voiceReply?: boolean; includesWelcome?: boolean }
) {
  await flowDeliveryContext.run(msg.testMode, async () => {
    if (msg.initialWelcomePrefix && !msg.initialWelcomeConsumed) {
      msg.initialWelcomeConsumed = true;
      if (!options?.includesWelcome) {
        // Em uma pergunta enviada por áudio, a saudação continua em texto e a
        // voz fica reservada para a resposta útil logo em seguida.
        await sendText({ number: msg.phone, text: msg.initialWelcomePrefix, voiceReply: false });
        if (!msg.testMode?.sendTextCallback) await delay(120);
      }
    }
    await sendText({ number: msg.phone, text, voiceReply: options?.voiceReply });
  });
  if (!msg.testMode?.sendTextCallback) {
    await delay(120);
  }
}

/**
 * Adapta o resultado do core handler para o formato do WhatsApp flow
 * Converte FlowResponse[] em chamadas de sendText/sendMedia e persiste o estado
 */
async function handleHumanHandoffRequest(msg: IncomingMessage, flow: FlowState) {
  const clientName = resolveValidCustomerName(flow.customerName) ?? resolveValidCustomerName(msg.pushName);

  // O simulador precisa refletir a transferência sem criar pendência no CRM
  // nem enviar mensagem a um telefone de teste.
  if (msg.testMode?.skipDb) {
    await sendTextWrapper(msg, handoffAcknowledgement(clientName));
    return;
  }

  const session = await prisma.whatsAppSession.findFirst({
    where: { phone: normalizePhone(msg.phone) },
    select: { id: true },
  });

  if (session?.id) {
    await requestHumanHandoff({
      phone: msg.phone,
      sessionId: session.id,
      reason: [
        "Solicitação pelo menu",
        flow.serviceLabel ? `serviço: ${flow.serviceLabel}` : null,
        `etapa: ${flow.stage}`,
      ]
        .filter(Boolean)
        .join(" | "),
      clientName: clientName ?? undefined,
    });
    return;
  }

  await sendText({
    number: msg.phone,
    text: handoffAcknowledgement(clientName),
  });
}

async function executeCoreHandler(
  msg: IncomingMessage,
  flow: FlowState,
  handler: (state: FlowState, message: string, responses: FlowResponse[], ...args: any[]) => Promise<FlowResult>,
  ...handlerArgs: any[]
): Promise<FlowResult> {
  const responses: FlowResponse[] = [];
  const result = await handler(flow, msg.text, responses, ...handlerArgs);

  // A criação final é atômica: não gravamos uma etapa intermediária de
  // confirmação antes de a reserva realmente existir.
  const deferFinalConfirmationPersistence =
    flow.stage === "ETAPA15_SUMMARY_CONFIRM" &&
    result.nextState.stage === "ETAPA16_CONFIRMATION";
  if (!deferFinalConfirmationPersistence) {
    await saveFlow(msg.phone, result.nextState, msg.testMode?.skipDb);
  }

  // Enviar as respostas
  for (const response of result.responses) {
    if (response.mediaUrl && response.mediaType) {
      if (msg.testMode?.sendTextCallback) {
        // Em modo de teste, retorna texto + mídia para exibição no painel
        await msg.testMode.sendTextCallback(`[MÍDIA: ${response.mediaType}|${response.mediaUrl}] ${response.text || ""}`);
      } else {
        await sendMedia({
          number: msg.phone,
          mediaUrl: response.mediaUrl,
          mediaType: response.mediaType,
        });
      }
    }
    if (response.text) {
      if (msg.testMode?.sendTextCallback) {
        await msg.testMode.sendTextCallback(response.text, { voiceReply: response.voiceReply });
      } else {
        await sendText({ number: msg.phone, text: response.text, voiceReply: response.voiceReply });
        await delay(120);
      }
    }
  }

  // Rastreamento de funil se necessário (apenas se não estiver em modo de teste)
  if (!msg.testMode && result.shouldTrackFunnel && result.funnelStage) {
    try {
      await trackProgress(msg.phone, result.funnelStage);
    } catch (error) {
      console.error("[executeCoreHandler] Error tracking funnel:", error);
    }
  }

  return result;
}

function flowMsg(wctx: WhatsAppCatalogContext) {
  const { prompts, catalog } = wctx;
  return {
    mainMenu: (flow: FlowState, pushName?: string) =>
      etapa2MainMenu(
        clientDisplayName(flow, pushName),
        buildMainMenu(wctx.categories, prompts),
        prompts
      ),
    subMenu: (n: number) => subMenuForCategoryCtx(n, wctx),
    detail: (key: string) => {
      const item = catalog[key];
      if (!item) return "";
      return serviceDetail(item, prompts, wctx.servicesByKey[key]?.whatsappDetail);
    },
  };
}

/** Duração estimada (min) por serviço do catálogo — usada se o DB não tiver o serviço */
const CATALOG_DURATION_MIN: Record<string, number> = {
  lavagem_simples: 60,
  lavagem_completa: 90,
  lavagem_detalhada: 120,
  limpeza_motor: 60,
  cristalizacao_farois: 90,
  descontaminacao_pintura: 60,
  descontaminacao_vidro: 60,
  higienizacao_tecido: 90,
  higienizacao_couro: 90,
  higienizacao_tecido_completa: 150,
  higienizacao_couro_completa: 150,
  polimento_cotacao: 240,
};

function parseFlow(raw: unknown): FlowState {
  if (!raw || typeof raw !== "object") {
    return { stage: "ETAPA1_AWAITING_NAME" };
  }
  return raw as FlowState;
}

function onlyNumber(input: string, max = MAIN_MENU_CATEGORIES): number | null {
  return onlyMenuNumber(input, max);
}

function clientDisplayName(flow: FlowState, pushName?: string): string {
  return (
    resolveValidCustomerName(flow.customerName) ??
    profileDisplayName(pushName) ??
    "Cliente"
  );
}

function profileDisplayName(pushName?: string | null): string | null {
  const name = resolveValidCustomerName(pushName);
  if (!name || /^(test|teste|user|usuario|usuário|cliente|admin|administrador)$/i.test(name)) {
    return null;
  }
  return name;
}

export function extractExplicitCustomerName(text: string): string | null {
  const trimmed = text.trim();
  const patterns = [
    /\b(?:me chamo|meu nome é|meu nome e|pode me chamar de|sou o|sou a)\s+([A-Za-zÀ-ú]{2,30})\b/i,
    /^([A-Za-zÀ-ú]{2,30})\s*[,;–-]\s*(?=(?:meu|minha|tenho|quero|preciso|gostaria)\b)/i,
    /^([A-Za-zÀ-ú]{2,30})\s+(?=(?:meu|minha)\b)/i,
  ];

  for (const pattern of patterns) {
    const candidate = trimmed.match(pattern)?.[1]?.trim();
    if (candidate && isValidCustomerName(candidate)) return candidate;
  }
  return null;
}

export function detectRequestedTimePreference(
  text: string
): FlowState["requestedTimePreference"] | undefined {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(manha|cedo|primeiro horario)\b/.test(normalized)) return "morning";
  if (/\b(tarde|depois do almoco)\b/.test(normalized)) return "afternoon";
  if (/\b(noite|fim do dia|final do dia)\b/.test(normalized)) return "evening";
  return undefined;
}

function requestedPeriodLabel(preference?: FlowState["requestedTimePreference"]): string | null {
  if (preference === "morning") return "manhã";
  if (preference === "afternoon") return "tarde";
  if (preference === "evening") return "fim do dia";
  return null;
}

function initialRequestSummaryText(flow: FlowState, wctx: WhatsAppCatalogContext): string {
  return initialRequestSummary(
    {
      name: clientDisplayName(flow),
      vehicle: [flow.vehicleModel, flow.vehicleYear].filter(Boolean).join(" ") +
        `${flow.vehiclePlate ? ` · placa ${flow.vehiclePlate}` : ""}` +
        `${flow.vehicleColor ? `, ${flow.vehicleColor}` : ""}` +
        `${flow.vehicleCondition && flow.vehicleCondition !== "normal" ? `, ${flow.vehicleCondition}` : ""}`,
      service: flow.serviceLabel ?? (flow.serviceKey ? wctx.catalog[flow.serviceKey]?.label : null) ?? "a definir",
      date: flow.dayLabel ?? flow.dayDate,
      period: requestedPeriodLabel(flow.requestedTimePreference),
    },
    wctx.prompts
  );
}

function extractCombinedVehicle(text: string) {
  const direct = text.match(
    /(?:\bmeu\b|\bminha\b|\btenho\s+(?:um|uma)\b)\s+([A-Za-z0-9À-ú-]+(?:\s+[A-Za-z0-9À-ú-]+){0,2})\s+(19[89]\d|20[0-2]\d)\b/i
  );
  if (!direct) return null;

  const colorMatch = text.match(
    /\b(preto|preta|branco|branca|prata|prateado|prateada|cinza|vermelho|vermelha|azul|verde|bege|marrom|dourado|champagne|grafite|amarelo|laranja|roxo|vinho)\b/i
  );
  return {
    model: direct[1].trim(),
    year: direct[2],
    color: colorMatch?.[1]?.toLowerCase() ?? "",
  };
}

async function extractCombinedInitialRequest(
  input: string,
  wctx: WhatsAppCatalogContext,
  pushName?: string
): Promise<FlowState | null> {
  const serviceKey = detectServiceKey(input);
  if (!serviceKey || serviceKey === "indeciso" || !wctx.catalog[serviceKey]) return null;

  const customerName = extractExplicitCustomerName(input) ?? profileDisplayName(pushName);
  if (!customerName) return null;

  const directVehicle = extractCombinedVehicle(input);
  const smartVehicle = directVehicle ? null : await parseVehicleMessageSmart(input);
  const vehicleModel = directVehicle?.model ?? smartVehicle?.model?.trim();
  const vehicleYear = directVehicle?.year ?? smartVehicle?.year;
  const vehicleColor = directVehicle?.color || smartVehicle?.color;
  const vehiclePlate = parsePlateFromText(input) ?? smartVehicle?.plate;
  if (!vehicleModel || !vehicleYear || !vehicleColor || !vehiclePlate) return null;

  const parsedDay = parseDayInput(input, null);
  const condition = normalizeConditionValue(smartVehicle?.condition || input);
  const item = wctx.catalog[serviceKey];
  return {
    stage: "ETAPA4_VEHICLE",
    welcomed: true,
    customerName,
    serviceKey,
    serviceLabel: item.label,
    pendingServiceKey: serviceKey,
    vehicleRaw: `${vehicleModel} ${vehicleYear}`,
    vehicleModel,
    vehiclePlate,
    vehicleYear,
    vehicleColor,
    vehicleCondition: condition,
    vehicleIsSuv: smartVehicle?.isSuv ?? isSuvLike(vehicleModel),
    vehicleConfirmed: false,
    vehicleCollectStep: undefined,
    dayDate: parsedDay?.dayDate,
    dayLabel: parsedDay?.dayLabel,
    requestedTimePreference: detectRequestedTimePreference(input),
    serviceRequestContext: input.slice(0, 500),
    awaitingInitialRequestConfirmation: true,
  };
}

function isNaturalConfirmation(input: string): boolean {
  return /^(1|sim|s|confirmo|confirmado|correto|isso|isso mesmo|está certo|esta certo|pode ser|perfeito|fechado|vamos seguir|continuar)$/i.test(
    input.trim()
  );
}

function wantsInitialCorrection(input: string): boolean {
  return /^(2|não|nao|corrigir|quero corrigir|alterar|quero alterar|tem algo errado)$/i.test(input.trim());
}

async function applyInitialRequestCorrection(
  flow: FlowState,
  input: string,
  wctx: WhatsAppCatalogContext
): Promise<{ next: FlowState; changed: boolean }> {
  let next: FlowState = { ...flow };
  const before = JSON.stringify({
    name: next.customerName,
    service: next.serviceKey,
    model: next.vehicleModel,
    year: next.vehicleYear,
    plate: next.vehiclePlate,
    color: next.vehicleColor,
    condition: next.vehicleCondition,
    date: next.dayDate,
    period: next.requestedTimePreference,
  });

  const correctedName = extractExplicitCustomerName(input) ?? input.match(/\bnome\s*(?:é|e|:)?\s*([A-Za-zÀ-ú]{2,30})\b/i)?.[1];
  if (correctedName && isValidCustomerName(correctedName)) next.customerName = correctedName;

  const serviceKey = detectServiceKey(input);
  if (serviceKey && serviceKey !== "indeciso" && wctx.catalog[serviceKey]) {
    next.serviceKey = serviceKey;
    next.pendingServiceKey = serviceKey;
    next.serviceLabel = wctx.catalog[serviceKey].label;
    next.dbServiceId = wctx.dbServiceIdByKey[serviceKey];
  }

  const day = parseDayInput(input, null);
  if (day) {
    next.dayDate = day.dayDate;
    next.dayLabel = day.dayLabel;
  }
  const preference = detectRequestedTimePreference(input);
  if (preference) next.requestedTimePreference = preference;

  const vehicle = await mergeVehicleDetails(next, input);
  if (vehicle.recognized) next = vehicle.next;

  const after = JSON.stringify({
    name: next.customerName,
    service: next.serviceKey,
    model: next.vehicleModel,
    year: next.vehicleYear,
    plate: next.vehiclePlate,
    color: next.vehicleColor,
    condition: next.vehicleCondition,
    date: next.dayDate,
    period: next.requestedTimePreference,
  });
  return { next, changed: before !== after };
}

function storeVehicle(flow: FlowState, text: string): FlowState {
  const p = parseVehicleMessage(text);
  const normalizedModel = (p.model || "").trim();
  const normalizedCondition = p.condition
    ? normalizeConditionValue(p.condition)
    : flow.vehicleCondition;
  const next: FlowState = {
    ...flow,
    vehicleRaw: p.summary,
    vehicleModel: normalizedModel || flow.vehicleModel,
    vehiclePlate: p.plate || flow.vehiclePlate,
    vehicleYear: p.year || flow.vehicleYear,
    vehicleColor: p.color || flow.vehicleColor,
    vehicleCondition: normalizedCondition,
    vehicleIsSuv: p.isSuv || flow.vehicleIsSuv,
  };
  next.vehicleCollectStep = hasVehicleInFlow(next) ? undefined : "details";
  return next;
}

function hasVehicleInFlow(flow: FlowState) {
  // A placa é obrigatória para permitir a identificação automática no portão.
  if (flow.vehicleModel && flow.vehicleYear && flow.vehiclePlate && flow.vehicleColor && flow.vehicleCondition) return true;
  
  // Verifica vehicleRaw APENAS se já tem cor e condição (requisito mínimo)
  if (flow.vehicleRaw && isValidVehicle(flow.vehicleRaw) && flow.vehiclePlate && flow.vehicleColor && flow.vehicleCondition) return true;
  
  return false;
}

function beginVehicleCollection(flow: FlowState, reset = false): FlowState {
  return {
    ...flow,
    stage: "ETAPA4_VEHICLE",
    vehicleCollectStep: "details",
    vehicleRaw: reset ? undefined : flow.vehicleRaw,
    vehicleModel: reset ? undefined : flow.vehicleModel,
    vehiclePlate: reset ? undefined : flow.vehiclePlate,
    vehicleYear: reset ? undefined : flow.vehicleYear,
    vehicleColor: reset ? undefined : flow.vehicleColor,
    vehicleCondition: reset ? undefined : flow.vehicleCondition,
    vehicleIsSuv: reset ? undefined : flow.vehicleIsSuv,
  };
}

type VehicleField = "model" | "year" | "plate" | "color" | "condition";

function missingVehicleFields(flow: FlowState): VehicleField[] {
  const missing: VehicleField[] = [];
  if (!flow.vehicleModel) missing.push("model");
  if (!flow.vehicleYear) missing.push("year");
  if (!flow.vehiclePlate) missing.push("plate");
  if (!flow.vehicleColor) missing.push("color");
  if (!flow.vehicleCondition) missing.push("condition");
  return missing;
}

function vehicleKnownLabel(flow: FlowState) {
  const details = [
    [flow.vehicleModel, flow.vehicleYear].filter(Boolean).join(" "),
    flow.vehiclePlate ? `placa ${flow.vehiclePlate}` : null,
    flow.vehicleColor,
    flow.vehicleCondition,
  ].filter(Boolean);
  return details.length ? details.join(", ") : "nenhum dado confirmado ainda";
}

function vehicleMissingCopy(flow: FlowState, prompts?: Record<string, string>) {
  const missing = missingVehicleFields(flow);
  const labels: Record<VehicleField, string> = {
    model: "modelo",
    year: "ano",
    plate: "placa",
    color: "cor",
    condition: "estado geral",
  };
  const examples: Record<VehicleField, string> = {
    model: "Civic",
    year: "2021",
    plate: "BRA2E19",
    color: "preto",
    condition: "bom estado",
  };
  return vehicleMissingDetails(
    vehicleKnownLabel(flow),
    missing.map((field) => labels[field]).join(", "),
    missing.map((field) => examples[field]).join(", "),
    prompts
  );
}

async function mergeVehicleDetails(flow: FlowState, input: string) {
  if (isGreetingOrSmallTalk(input) && !parseYearFromText(input)) {
    return { next: flow, recognized: false };
  }
  const parsed = await parseVehicleMessageSmart(input);
  const explicitModelCorrection = /\b(modelo|carro|veículo|veiculo)\b/i.test(input);
  const replaceModel = !flow.vehicleModel || explicitModelCorrection || Boolean(parsed.year && parsed.model);
  const candidateModel = parsed.model?.trim();
  const model = replaceModel && candidateModel ? candidateModel : flow.vehicleModel;
  const condition = parsed.condition
    ? normalizeConditionValue(parsed.condition)
    : flow.vehicleCondition;

  const next: FlowState = {
    ...flow,
    vehicleModel: model,
    vehiclePlate: parsed.plate || flow.vehiclePlate,
    vehicleYear: parsed.year || flow.vehicleYear,
    vehicleColor: parsed.color || flow.vehicleColor,
    vehicleCondition: condition,
    vehicleIsSuv: parsed.isSuv || flow.vehicleIsSuv,
  };

  if (next.vehicleModel && next.vehicleYear) {
    next.vehicleRaw = `${next.vehicleModel} ${next.vehicleYear}`;
  }
  next.vehicleCollectStep = hasVehicleInFlow(next) ? undefined : "details";

  const recognized = Boolean(
    candidateModel || parsed.year || parsed.plate || parsed.color || parsed.condition
  );
  return { next, recognized };
}

function buildContactAnswer(ctx: FlowContext) {
  const lines = [
    `📍 Endereço: ${ctx.address || "Ainda não definido"}`,
    `⏱ Horário: ${ctx.hours}`,
  ];

  if (ctx.pixKey) {
    lines.push(`💳 PIX: ${ctx.pixKey}`);
    if (ctx.pixHolder) lines.push(`Nome: ${ctx.pixHolder}`);
    if (ctx.pixBank) lines.push(`Banco: ${ctx.pixBank}`);
  } else {
    lines.push(`💳 Pagamento: aceitamos PIX, cartão e dinheiro no local.`);
  }

  return lines.join("\n");
}

async function hydrateReturningClientData(flow: FlowState, phone: string) {
  if (flow.savedVehicle && flow.savedVehiclePlate !== undefined && flow.loyaltyPoints != null) return flow;

  if (flowDeliveryContext.getStore()?.skipDb) {
    return { ...flow, loyaltyPoints: flow.loyaltyPoints ?? 0 };
  }

  try {
    const client = await prisma.client.findUnique({
      where: { phone: normalizePhone(phone) },
      include: {
        appointments: {
          where: { status: "COMPLETED" },
          select: { id: true },
        },
      },
    });

    if (!client) return flow;

    return {
      ...flow,
      savedVehicle: client.vehicleModel || client.vehiclePlate || null,
      savedVehiclePlate: client.vehiclePlate || null,
      loyaltyPoints: client.appointments.length * 10,
    };
  } catch (error) {
    console.error("[WhatsApp Flow] Não foi possível hidratar o cliente recorrente.", error);
    return flow;
  }
}

async function createReferralCoupon(): Promise<string> {
  const baseCode = `INDICA${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  let code = baseCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (!existing) break;
    code = `INDICA${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  const validTo = new Date();
  validTo.setDate(validTo.getDate() + 30);

  await prisma.coupon.create({
    data: {
      code,
      type: "percent",
      amount: new Prisma.Decimal(10),
      active: true,
      usageLimit: 1,
      usagePerCustomer: 1,
      validFrom: new Date(),
      validTo,
    },
  });

  return code;
}

async function fetchUpcomingAppointments(phone: string) {
  return prisma.appointment.findMany({
    where: {
      client: { phone: normalizePhone(phone) },
      status: { in: ["CONFIRMED", "PENDING", "IN_PROGRESS"] },
    },
    orderBy: { date: "asc" },
    include: { service: true },
  });
}

function renderAppointmentsSummary(appointments: Array<{ date: Date; startTime: string; service: { name: string; whatsappShort?: string | null } }> ) {
  if (!appointments.length) return `Você não tem agendamentos ativos no momento. Quer ver o menu para agendar outro serviço?`;

  const lines = [
    `Aqui estão seus próximos agendamentos:`,
    "━━━━━━━━━━━━━━━",
  ];

  for (const appointment of appointments.slice(0, 4)) {
    const serviceLabel = appointment.service.whatsappShort ?? appointment.service.name;
    lines.push(`• ${format(new Date(appointment.date), "dd/MM/yyyy")} às ${appointment.startTime} — ${serviceLabel}`);
  }

  return `${lines.join("\n")}\n\nSe quiser, digite *menu* para voltar ao início.`;
}

async function handleGlobalCommands(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  lower: string,
  scope: "account" | "business" | "all" = "all"
): Promise<boolean> {
  const isAppointments = /\b(meus agendamentos|minhas reservas|minhas agendas|meu agendamento|meu horário|meus horários)\b/i.test(lower);
  const isServiceStatus = /\b(meu carro (?:está|esta) pronto|carro (?:está|esta) pronto|status (?:do|de meu|do meu) (?:carro|veículo|veiculo|serviço|servico)|como (?:está|esta) (?:meu|o) (?:carro|veículo|veiculo)|acompanhar (?:o )?serviço)\b/i.test(lower);
  const isPoints = /\b(meus pontos|pontos|saldo de pontos|saldo)\b/i.test(lower);
  const isReferral = /\b(indicar (?:um |uma )?amigo|indique (?:um |uma )?amigo|indicar amigo|refe?r[aê]ncia|indicação)\b/i.test(lower);
  const isAddress = /\b(endereço|localiza[cç][aã]o|onde fica|onde estamos|localização|rua|avenida|av\.?|local)\b/i.test(lower);
  const isHours = /\b(hor[aá]rio|horarios|horários|funcionamento|abertura|fechamento|atendemos|atendendo)\b/i.test(lower);
  const isPayment = /\b(pagamento|pix|cart[aã]o|dinheiro|forma de pagamento|tarifa|valor|preço|preco|custa|quanto custa)\b/i.test(lower);

  const handlesAccount = scope !== "business";
  const handlesBusiness = scope !== "account";

  if (handlesAccount && isServiceStatus) {
    const appointment = await fetchLatestServiceStatus(msg.phone);
    if (!appointment) {
      await sendText({
        number: msg.phone,
        text: "Não encontrei um serviço recente em andamento para este número. Se quiser, responda *9* e a equipe verifica manualmente para você.",
      });
      return true;
    }

    const status = serviceStatusCopy(appointment.status);
    await sendText({
      number: msg.phone,
      text: renderPrompt(wctx.prompts, "appointment_status", {
        name: appointment.client.name,
        service: appointment.service.name,
        vehicle: appointment.client.vehicleModel ?? "seu veículo",
        statusLabel: status.label,
        statusMessage: status.message,
        dateLabel: format(new Date(appointment.date), "dd/MM/yyyy"),
        time: appointment.startTime,
      }),
    });
    return true;
  }

  if (handlesAccount && isAppointments) {
    const appointments = await fetchUpcomingAppointments(msg.phone);
    await sendText({ number: msg.phone, text: renderAppointmentsSummary(appointments) });
    return true;
  }

  if (handlesAccount && isPoints) {
    const points = flow.loyaltyPoints ?? 0;
    const discountValue = Math.floor(points / 100) * 10;
    await sendText({
      number: msg.phone,
      text: `Você tem *${points}* pontos de fidelidade.\n` +
        `Pode usar para ganhar *R$ ${discountValue.toFixed(2).replace('.', ',')}* de desconto no próximo agendamento.\n\n` +
        `Digite *menu* para ver o catálogo ou continue o atendimento normalmente.`,
    });
    return true;
  }

  if (handlesAccount && isReferral) {
    const code = await createReferralCoupon();
    await sendText({
      number: msg.phone,
      text: `🎁 Seu cupom de indicação: *${code}*\n\nCompartilhe com um amigo para ele ganhar *10% de desconto* no primeiro agendamento.\n` +
        `O cupom vale por 30 dias e tem 1 uso.\n\nSe quiser, digite *menu* para voltar ao atendimento.`,
    });
    return true;
  }

  if (handlesBusiness && (isAddress || isHours || isPayment)) {
    const answer = buildContactAnswer(ctx);
    const extra = isPayment
      ? `\n\nAceitamos PIX, cartão e dinheiro no local. Se quiser, posso ajudar a agendar um horário.`
      : "";
    await sendText({ number: msg.phone, text: `${answer}${extra}` });
    return true;
  }

  return false;
}

async function goToVehicleStep(msg: IncomingMessage, flow: FlowState, wctx: WhatsAppCatalogContext) {
  if (flow.savedVehicle && !hasVehicleInFlow(flow)) {
    const saved = parseVehicleMessage(flow.savedVehicle);
    const next: FlowState = {
      ...flow,
      stage: "ETAPA4_VEHICLE",
      vehicleModel: saved.model || flow.savedVehicle,
      vehiclePlate: flow.savedVehiclePlate || saved.plate || undefined,
      vehicleRaw: saved.summary || flow.savedVehicle,
      vehicleYear: saved.year || undefined,
      vehicleColor: undefined,
      vehicleCondition: undefined,
      vehicleIsSuv: saved.isSuv,
      vehicleCollectStep: "details",
      awaitingSavedVehicleChoice: true,
    };
    await saveFlow(msg.phone, next);
    await sendText({
      number: msg.phone,
      text: `Veículo salvo encontrado: *${flow.savedVehicle}${flow.savedVehiclePlate ? ` · ${flow.savedVehiclePlate}` : ""}*.

Deseja usar esse veículo novamente?
*1* — Sim
*2* — Não, informar outro veículo`,
    });
    return;
  }

  const next = beginVehicleCollection(flow);
  await saveFlow(msg.phone, next);
  await sendText({
    number: msg.phone,
    text: vehicleKnownLabel(next) === "nenhum dado confirmado ainda"
      ? etapa4Vehicle(false, wctx.prompts)
      : vehicleMissingCopy(next, wctx.prompts),
  });
}

function normalizeConditionValue(value: string | null | undefined): "excelente" | "bom" | "normal" | "ruim" {
  const normalized = (value ?? "").toLowerCase().trim();
  if (!normalized) return "normal";
  if (/(excelente|novo|zero km|seminovo|otimo|ótimo)/.test(normalized)) return "excelente";
  if (/(bom|bom estado|pouco uso|bem|limpo)/.test(normalized)) return "bom";
  if (/(ruim|arranh|feio|sujei|muito sujo|mancha|oxida|opac|precisa de atenção|precisa de atencao|gasto)/.test(normalized)) {
    return "ruim";
  }
  return "normal";
}

function quoteForKey(key: string, flow: FlowState, wctx: WhatsAppCatalogContext) {
  const item = wctx.catalog[key];
  if (!item || key === "indeciso") {
    return { min: 0, max: 0, time: "—", label: flow.serviceLabel ?? "Serviço" };
  }
  const vehicleText = vehicleDisplayFromFlow(flow);
  const suv = flow.vehicleIsSuv ?? isSuvLike(vehicleText);
  const bad = isBadCondition(vehicleText) || normalizeConditionValue(flow.vehicleCondition ?? "") === "ruim";
  let min = suv ? item.suvMin : item.hatchMin;
  let max = suv ? item.suvMax : item.hatchMax;
  if (bad && min > 0) {
    min = Math.round(min * 1.08);
    max = Math.round(max * 1.12);
  }
  if (min <= 0 && key === "polimento_cotacao") {
    return { min: 0, max: 0, time: item.time, label: item.label };
  }
  return { min, max, time: item.time, label: item.label };
}

async function activateService(
  msg: IncomingMessage,
  flow: FlowState,
  serviceKey: string,
  wctx: WhatsAppCatalogContext
) {
  const item = wctx.catalog[serviceKey];
  if (!item) return;
  const dbService = msg.testMode?.skipDb ? null : await resolveDbService(serviceKey, item.dbMatch);
  const dbId = wctx.dbServiceIdByKey[serviceKey] ?? dbService?.id;
  const activeFlow: FlowState = {
    ...flow,
    serviceKey,
    serviceLabel: item.label,
    dbServiceId: dbId,
    stage: serviceKey === "pacotes" ? "ETAPA3_PACKAGE_ACTION" : "ETAPA3_SERVICE_ACTION",
  };
  await saveFlow(msg.phone, activeFlow);
  const requestContext = (flow.serviceRequestContext ?? "").toLowerCase();
  const contextualIntro = /terra|barro|poeira|muito sujo/.test(requestContext) && /lavagem/.test(serviceKey)
    ? "Pelo que você contou sobre a sujeira do veículo, esta opção é um bom ponto de partida. Se houver resíduos muito aderidos, confirmamos o nível ideal após uma avaliação rápida."
    : /mancha|odor|cheiro/.test(requestContext) && /higienizacao/.test(serviceKey)
      ? "Como você mencionou manchas ou odores, esta higienização é a opção mais alinhada ao seu caso. A avaliação identifica o tratamento adequado para o revestimento."
      : /risco|opac|sem brilho/.test(requestContext) && /polimento|pintura/.test(serviceKey)
        ? "Pelo relato sobre riscos ou perda de brilho, este serviço é o mais indicado para começarmos a avaliação da pintura."
        : null;
  const detailText = `${contextualIntro ? `${contextualIntro}\n\n` : ""}${flowMsg(wctx).detail(serviceKey)}`;

  // Enviar imagem do serviço (se existir)
  if (dbId) {
    try {
      // Nem todo schema possui serviceMedia; tratar de forma compatível.
      const media = await (prisma as any).serviceMedia?.findFirst({
        where: { serviceId: dbId },
        orderBy: { createdAt: "asc" },
      });

      if (media?.path) {
        const mediaType = media.mimeType?.startsWith("video/")
          ? "video"
          : media.mimeType?.startsWith("image/")
          ? "image"
          : "document";

        await sendMedia({
          number: msg.phone,
          mediaUrl: media.path,
          caption: item.label,
          mediaType,
        });
        await delay(300);
      }

      await delay(150);
      await sendText({ number: msg.phone, text: detailText });
    } catch (err) {
      console.error("[Midia] Erro ao enviar mídia do serviço:", err);
    }
  } else {
    await delay(150);
    await sendText({ number: msg.phone, text: detailText });
  }
}

function dateLabel(date: Date, includeYear = false) {
  return format(date, includeYear ? "dd/MM/yyyy (EEEE)" : "dd/MM (EEEE)", { locale: ptBR });
}

function validBusinessDay(date: Date) {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date >= dayStart && date.getDay() !== 0;
}

export function parseDayInput(input: string, num: number | null) {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // A lista interativa oficial envia o selectedRowId em ISO (YYYY-MM-DD).
  // Ele precisa ser interpretado antes de qualquer regex de DD/MM.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsedDate = parse(trimmed, "yyyy-MM-dd", new Date());
    if (format(parsedDate, "yyyy-MM-dd") !== trimmed || !validBusinessDay(parsedDate)) return null;
    return { dayDate: trimmed, dayLabel: dateLabel(parsedDate, true) };
  }

  if (num && WEEKDAYS[num]) {
    const wd = WEEKDAYS[num];
    return { dayDate: nextWeekdayDate(wd.day), dayLabel: wd.label };
  }

  if (/\bhoje\b/.test(lower)) {
    const d = new Date();
    if (!validBusinessDay(d)) return null;
    return {
      dayDate: format(d, "yyyy-MM-dd"),
      dayLabel: dateLabel(d),
    };
  }

  if (/amanh/.test(lower)) {
    const d = addDays(new Date(), 1);
    if (!validBusinessDay(d)) return null;
    return {
      dayDate: format(d, "yyyy-MM-dd"),
      dayLabel: dateLabel(d),
    };
  }
  const weekdayMap: Array<[RegExp, number, string]> = [
    [/segunda/, 1, "Segunda-feira"],
    [/terça|terca/, 2, "Terça-feira"],
    [/quarta/, 3, "Quarta-feira"],
    [/quinta/, 4, "Quinta-feira"],
    [/sexta/, 5, "Sexta-feira"],
    [/sábado|sabado/, 6, "Sábado"],
  ];
  for (const [re, day, label] of weekdayMap) {
    if (re.test(lower)) {
      return { dayDate: nextWeekdayDate(day), dayLabel: label };
    }
  }
  const parsed = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (parsed) {
    const day = Number(parsed[1]);
    const month = Number(parsed[2]);
    let year = parsed[3]
      ? parsed[3].length === 2
        ? Number(`20${parsed[3]}`)
        : Number(parsed[3])
      : new Date().getFullYear();
    let parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) return null;
    if (!parsed[3] && !validBusinessDay(parsedDate)) {
      year += 1;
      parsedDate = new Date(year, month - 1, day);
    }
    if (!validBusinessDay(parsedDate)) return null;
    return {
      dayDate: format(parsedDate, "yyyy-MM-dd"),
      dayLabel: dateLabel(parsedDate, true),
    };
  }

  // Datas de dois dígitos acima de 8 são o dia do mês atual (ou do próximo
  // mês, se este já passou). As opções 1–6 continuam significando o dia da
  // semana exibido no menu oficial.
  if (/^\d{1,2}$/.test(trimmed)) {
    const day = Number(trimmed);
    if (day < 7 || day > 31) return null;
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let parsedDate = new Date(year, month, day);
    if (parsedDate.getMonth() !== month) return null;
    if (!validBusinessDay(parsedDate)) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      parsedDate = new Date(year, month, day);
    }
    if (parsedDate.getMonth() !== month || !validBusinessDay(parsedDate)) return null;
    return {
      dayDate: format(parsedDate, "yyyy-MM-dd"),
      dayLabel: dateLabel(parsedDate, true),
    };
  }
  return null;
}

function availabilityServiceSelectionText(
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  pushName?: string
): string {
  const name = clientDisplayName(flow, pushName);
  const date = flow.dayLabel ?? flow.dayDate;
  return [
    `Claro, *${name}*. ${date ? `Considerei *${date}*.` : "Vamos encontrar a melhor data para você."}`,
    "",
    "Para consultar os horários reais, primeiro preciso saber qual serviço você deseja — a duração muda conforme o cuidado escolhido.",
    "",
    buildMainMenu(wctx.categories, wctx.prompts),
    "",
    "_Você pode responder com o número ou escrever o nome do serviço._",
  ].join("\n");
}

async function showAvailabilityServiceSelection(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
) {
  const next: FlowState = {
    ...flow,
    stage: "ETAPA2_MAIN_MENU",
    welcomed: true,
    pendingInitialIntent: "schedule",
  };
  await saveFlow(msg.phone, next, !!msg.testMode);
  msg.testMode?.onFlowStateChange?.(next);
  if (looksLikeQuestion(msg.text)) {
    await sendTextWrapper(
      msg,
      "Claro. Posso verificar a agenda para você. Primeiro preciso saber qual serviço deseja, porque a duração muda os horários disponíveis.",
      { voiceReply: true }
    );
  }
  await sendTextWrapper(msg, availabilityServiceSelectionText(next, wctx, msg.pushName), { voiceReply: false });
  await sendCalendarWithImageAndList({ number: msg.phone, prompts: wctx.prompts });
}

function isSuvLike(text: string) {
  const t = text.toLowerCase();
  return /suv|pickup|picape|van|camionete|4x4|hilux|ranger|s10|toro|compass|renegade|t-cross|creta/i.test(
    t
  );
}

function isBadCondition(text: string) {
  return normalizeConditionValue(text) === "ruim";
}

function buildBudgetMessage(flow: FlowState) {
  const serviceValue = Number(flow.quoteMin ?? 0);
  const complementValue = flow.upsellAccepted ? Number(flow.upsellValue ?? 0) : 0;
  const pickupValue = Number(flow.pickupFee ?? 0);
  const couponValue = flow.quoteDiscountMode === "base" ? Number(flow.couponDiscountApplied ?? 0) : 0;
  const firstTimeBonus = flow.firstTimeBonusApplied &&
    flow.quoteDiscountMode === "base" &&
    !flow.couponId &&
    !flow.couponCode
    ? Number(flow.firstTimeBonusDiscount ?? 0)
    : 0;
  const totalValue = calculateFlowTotal(flow);

  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **Seu orçamento**",
    `- Serviço: ${flow.serviceLabel ?? "Serviço premium"} — **R$ ${serviceValue.toFixed(2).replace(".", ",")}**`,
  ];

  if (complementValue > 0) {
    lines.push(`- Proteção: **R$ ${complementValue.toFixed(2).replace(".", ",")}**`);
  }

  if (pickupValue > 0) {
    lines.push(`- Leva e traz: **R$ ${pickupValue.toFixed(2).replace(".", ",")}**`);
  }

  if (couponValue > 0) {
    lines.push(`- Cupom: **- R$ ${couponValue.toFixed(2).replace(".", ",")}**`);
  }

  if (firstTimeBonus > 0) {
    lines.push(`- Bônus de primeira visita: **- R$ ${firstTimeBonus.toFixed(2).replace(".", ",")}**`);
  }

  lines.push(`- **Total: R$ ${totalValue.toFixed(2).replace(".", ",")}**`);
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

async function loadContext(): Promise<FlowContext> {
  let s: Awaited<ReturnType<typeof prisma.settings.findUnique>> = null;
  try {
    s = await prisma.settings.findUnique({ where: { id: "default" } });
  } catch (error) {
    if (!flowDeliveryContext.getStore()?.skipDb) throw error;
    console.error("[WhatsApp Flow] Configurações externas indisponíveis no simulador; usando padrões locais.", error);
  }
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

async function saveFlow(phone: string, flow: FlowState, skipDb = false) {
  // O contexto de entrega também protege todas as gravações internas do
  // simulador. Assim, etapas que chamam saveFlow sem repassar explicitamente
  // o parâmetro não tentam atualizar uma sessão inexistente no banco.
  const shouldSkipDb = skipDb || Boolean(flowDeliveryContext.getStore()?.skipDb);
  if (shouldSkipDb) {
    flowDeliveryContext.getStore()?.onFlowStateChange?.(flow);
    console.log("[WhatsApp Flow] 💾 Salvando estado do fluxo (modo de teste - sem persistência):", { phone, stage: flow.stage, welcomed: flow.welcomed });
    return;
  }
  console.log("[WhatsApp Flow] 💾 Salvando estado do fluxo:", { phone, stage: flow.stage, welcomed: flow.welcomed });
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: { metadata: flow as object, lastStage: flow.stage },
  });
  console.log("[WhatsApp Flow] ✅ Estado salvo com sucesso");
}

async function resolveDbService(serviceKey?: string, dbMatch?: string) {
  const ors: Array<Record<string, unknown>> = [];

  if (serviceKey) {
    ors.push({ catalogKey: serviceKey });
  }

  if (dbMatch) {
    ors.push({ name: { contains: dbMatch, mode: "insensitive" } });
    ors.push({ catalogKey: { contains: dbMatch, mode: "insensitive" } });
  }

  if (ors.length === 0) {
    return null;
  }

  return prisma.service.findFirst({
    where: { active: true, OR: ors } as any,
  });
}

function nextWeekdayDate(weekday: number): string {
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, i);
    if (d.getDay() === weekday) return format(d, "yyyy-MM-dd");
  }
  return format(addDays(today, 1), "yyyy-MM-dd");
}

const WEEKDAYS: Record<number, { label: string; day: number }> = {
  1: { label: "Segunda-feira", day: 1 },
  2: { label: "Terça-feira", day: 2 },
  3: { label: "Quarta-feira", day: 3 },
  4: { label: "Quinta-feira", day: 4 },
  5: { label: "Sexta-feira", day: 5 },
  6: { label: "Sábado", day: 6 },
};

async function getFlowDurationMin(flow: FlowState, wctx: WhatsAppCatalogContext): Promise<number> {
  if (flow.dbServiceId) {
    const s = await prisma.service.findUnique({ where: { id: flow.dbServiceId } });
    if (s?.durationMin) return s.durationMin;
  }
  const key = flow.serviceKey ?? "lavagem_detalhada";
  const svc = wctx.servicesByKey[key];
  if (svc?.durationMin) return svc.durationMin;
  return CATALOG_DURATION_MIN[key] ?? 120;
}

async function proceedToTimeSelection(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
) {
  let durationMin = await getFlowDurationMin(flow, wctx);
  if (flow.upsellAccepted) durationMin += flow.upsellDurationMin ?? 60;

  if (!flow.dayDate) return;

  let slots: string[] = [];
  try {
    slots = await generateAvailableSlots(flow.dayDate, durationMin);
  } catch (error) {
    if (!flowDeliveryContext.getStore()?.skipDb) throw error;
    console.warn("[WhatsApp Flow] Agenda indisponível no simulador; usando horários de demonstração.", error);
  }
  if (slots.length === 0 && flowDeliveryContext.getStore()?.skipDb) {
    slots = ["09:00", "11:00", "14:00", "16:00"];
  }
  const requestedPreference = flow.requestedTimePreference;
  let preferenceApplied = false;
  if (requestedPreference && slots.length > 0) {
    const preferredSlots = slots.filter((slot) => {
      const hour = Number(slot.split(":")[0]);
      if (requestedPreference === "morning") return hour < 12;
      if (requestedPreference === "afternoon") return hour >= 12 && hour < 18;
      return hour >= 18;
    });
    if (preferredSlots.length > 0) {
      slots = preferredSlots;
      preferenceApplied = true;
    }
  }
  flow.serviceDurationMin = durationMin;
  flow.availableSlots = slots;
  const { prompts } = wctx;

  if (slots.length === 0) {
    flow.stage = "ETAPA7_DAY";
    delete flow.availableSlots;
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: etapa7NoSlots(flow.dayLabel ?? "este dia", prompts),
    });
    return;
  }

  flow.stage = "ETAPA7_TIME";
  await saveFlow(msg.phone, flow);
  await sendText({
    number: msg.phone,
    text: `${requestedPreference
      ? preferenceApplied
        ? `Encontrei estes horários no período da *${requestedPeriodLabel(requestedPreference)}*, como você pediu.\n\n`
        : `Não encontrei vagas no período da *${requestedPeriodLabel(requestedPreference)}*; abaixo estão as opções disponíveis no dia.\n\n`
      : ""}${etapa7Time(
        flow.dayLabel ?? flow.dayDate,
        slots,
        formatDurationLabel(durationMin),
        prompts
      )}`,
  });
}

async function ensureClient(phone: string, name: string, skipDb = false) {
  if (skipDb) {
    console.log("[WhatsApp Flow] 👤 Criando cliente (modo de teste - sem persistência):", { phone, name });
    return;
  }
  const normalized = normalizePhone(phone);
  const validName = resolveValidCustomerName(name) ?? name;
  let client = await prisma.client.findUnique({ where: { phone: normalized } });
  if (!client) {
    client = await prisma.client.create({ data: { name: validName, phone: normalized } });
  } else if (resolveValidCustomerName(client.name) !== validName && looksLikePersonName(validName)) {
    client = await prisma.client.update({ where: { id: client.id }, data: { name: validName } });
  }
  await prisma.whatsAppSession.update({
    where: { phone: normalized },
    data: { clientId: client.id },
  });
  return client;
}

function clampMoney(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v * 100) / 100);
}

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

async function applyCouponToFlowValue(params: {
  coupon: any;
  flow: FlowState;
}): Promise<{ flow: FlowState; discountApplied: number }> {
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

  newMin = clampMoney(newMin);
  newMax = clampMoney(newMax);

  // O total do fluxo usa a faixa inicial (`quoteMin`); o desconto precisa ser
  // calculado sobre essa mesma base para manter o valor exibido e cobrado iguais.
  const discountApplied = clampMoney(baseMin - newMin);

  return {
    flow: {
      ...flow,
      // O orçamento permanece como valor-base. O total é composto uma única
      // vez no resumo, pagamento e criação do agendamento.
      couponDiscountApplied: discountApplied,
      quoteDiscountMode: "base",
    },
    discountApplied,
  };
}

class AppointmentSlotConflictError extends Error {}

async function createAppointment(flow: FlowState, phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const [client, session] = await Promise.all([
    prisma.client.findUnique({ where: { phone: normalizedPhone } }),
    prisma.whatsAppSession.findUnique({
      where: { phone: normalizedPhone },
      select: { pendingAppointmentId: true },
    }),
  ]);

  if (session?.pendingAppointmentId) {
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: session.pendingAppointmentId },
    });
    if (existingAppointment) {
      return { appointment: existingAppointment, conflict: false };
    }
  }

  const startTime = flow.startTime;
  if (!client || !flow.dbServiceId || !flow.dayDate || !startTime) {
    return { appointment: null, conflict: false };
  }

  const service = await prisma.service.findUnique({ where: { id: flow.dbServiceId } });
  if (!service) {
    return { appointment: null, conflict: false };
  }

  const durationMin = flow.serviceDurationMin ?? service.durationMin;
  const startMin = timeToMinutes(startTime);
  const date = parse(flow.dayDate, "yyyy-MM-dd", new Date());
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const finalValue = calculateFlowTotal({
    ...flow,
    quoteMin: flow.quoteMin ?? Number(service.price),
  });

  // Determinar status de pagamento baseado no tipo de PIX e pagamentos parciais
  let paymentStatus = "PENDING";
  let paidAt = null;
  let transactionId = null;

  const totalPaid = flow.totalPaid ?? flow.receiptAmount ?? 0;

  if (flow.pixPaymentType === "now" && totalPaid > 0) {
    // PIX pago agora (completo ou parcial)
    if (totalPaid >= finalValue) {
      // Pagamento completo
      paymentStatus = "PAID";
      paidAt = new Date();
      transactionId = `RECEIPT-${Date.now()}`;
    } else {
      // Pagamento parcial
      paymentStatus = "PARTIAL";
      paidAt = new Date();
      transactionId = `PARTIAL-${Date.now()}`;
    }
  } else if (flow.pixPaymentType === "delivery") {
    // PIX na entrega - mantém como pendente
    paymentStatus = "PENDING";
  }

  try {
    const appointment = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findMany({
      where: {
        date: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { startTime: true, endTime: true },
    });
    if (overlapsExisting(startMin, durationMin, existing)) {
      throw new AppointmentSlotConflictError();
    }

    const created = await tx.appointment.create({
      data: {
        clientId: client.id,
        serviceId: service.id,
        date,
        startTime,
        endTime: calculateEndTime(startTime, durationMin),
        status: AppointmentStatus.CONFIRMED,
        source: "whatsapp",
        clientConfirmedAt: null,
        notes: [
          flow.vehicleRaw,
          flow.paymentMethod,
          flow.needsPickup ? `Pickup: ${flow.pickupAddress ?? "endereço informado"}` : null,
          flow.needsReturn ? "Retorno desejado" : null,
          flow.upsellLabel ? `Upsell: ${flow.upsellLabel}` : null,
          flow.packageKey,
          flow.totalPaid && flow.totalPaid < finalValue
            ? `Pagamento parcial: R$ ${flow.totalPaid.toFixed(2).replace('.', ',')} / R$ ${finalValue.toFixed(2).replace('.', ',')}`
            : flow.receiptImageUrl
            ? `Comprovante: ${flow.receiptImageUrl}`
            : null,
          flow.partialPayments && flow.partialPayments.length > 0
            ? `Pagamentos: ${flow.partialPayments.map(p => `R$ ${p.amount.toFixed(2).replace('.', ',')}`).join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join(" | "),
        needsPickup: flow.needsPickup ?? false,
        needsReturn: flow.needsReturn ?? false,
        pickupAddress: flow.pickupAddress ?? undefined,
        pickupDistanceKm: flow.pickupDistanceKm ? flow.pickupDistanceKm : undefined,
        pickupFee: flow.pickupFee ? flow.pickupFee : undefined,
        couponId: flow.couponId ?? undefined,
        couponDiscount: flow.couponDiscountApplied ? flow.couponDiscountApplied : undefined,
        finalPrice: new Prisma.Decimal(finalValue),
        reminderPreference: flow.reminderPreference ?? "30min", // Default 30min reminder
        paymentStatus: paymentStatus as any,
        paymentMethod: flow.paymentMethod,
        paidAt: paidAt,
        transactionId: transactionId,
      },
    });

    if (flow.couponId && flow.couponDiscountApplied && flow.couponDiscountApplied > 0) {
      await tx.couponRedemption.create({
        data: {
          couponId: flow.couponId,
          clientId: client.id,
          appointmentId: created.id,
          amountApplied: new Prisma.Decimal(flow.couponDiscountApplied),
        },
      });
    }

    await tx.financialRecord.create({
      data: {
        type: "INCOME",
        category: "SERVICE",
        amount: new Prisma.Decimal(finalValue),
        description: `WhatsApp - ${flow.serviceLabel}`,
        appointmentId: created.id,
        serviceId: service.id,
      },
    });

    const vehicleModel = [flow.vehicleModel, flow.vehicleYear].filter(Boolean).join(" ").trim();
    if (vehicleModel || flow.vehiclePlate) {
      await tx.client.update({
        where: { id: client.id },
        data: {
          vehicleModel: vehicleModel || undefined,
          vehiclePlate: flow.vehiclePlate || undefined,
        },
      });
    }

    await tx.whatsAppSession.updateMany({
      where: { phone: normalizedPhone },
      data: { pendingAppointmentId: created.id },
    });

    return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { appointment, conflict: false };
  } catch (error) {
    if (
      error instanceof AppointmentSlotConflictError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return { appointment: null, conflict: true };
    }
    throw error;
  }
}

async function sendQuote(msg: IncomingMessage, flow: FlowState, wctx: WhatsAppCatalogContext) {
  const vehicleText = vehicleDisplayFromFlow(flow);
  const key = flow.serviceKey ?? "lavagem_detalhada";
  const quote =
    key === "pacotes"
      ? {
          min: flow.vehicleIsSuv ? 900 : 550,
          max: flow.vehicleIsSuv ? 1500 : 900,
          time: "1 dia",
          label: flow.packageKey ?? "Pacote Premium",
        }
      : quoteForKey(key, flow, wctx);
  flow.quoteMin = quote.min;
  flow.quoteMax = quote.max;
  flow.estimatedTime = quote.time;
  flow.serviceLabel = quote.label;
  flow.stage = quote.min > 0 ? "ETAPA7_DAY" : "ETAPA5_QUOTE";
  await saveFlow(msg.phone, flow);
  let quoteText = etapa5Quote(
      flow.customerName ?? "Cliente",
      vehicleText,
      quote.label,
      quote.min,
      quote.max,
      quote.time,
      quotePitchForService(key, wctx.catalog),
      wctx.prompts
    );
  if (flow.dayDate) {
    const chosenDay = flow.dayLabel ?? flow.dayDate;
    quoteText = quoteText.replace(
      /_Agora escolha o melhor dia no calend[aá]rio abaixo\._/i,
      `_Como você já escolheu *${chosenDay}*, separei os horários disponíveis._`
    );
  }
  await sendText({
    number: msg.phone,
    text: quoteText,
  });

  // A confirmação do veículo já demonstra intenção de agendar. Evitamos uma
  // segunda pergunta de confirmação e seguimos direto para o calendário.
  if (quote.min > 0) {
    if (flow.dayDate) {
      await proceedToTimeSelection(msg, flow, wctx);
    } else {
      await sendCalendarWithImageAndList({ number: msg.phone, prompts: wctx.prompts });
    }
  }
}

export async function processNumberedFlow(msg: IncomingMessage, flow: FlowState) {
  return flowDeliveryContext.run(msg.testMode, () => processNumberedFlowInternal(msg, flow));
}

async function processNumberedFlowInternal(msg: IncomingMessage, flow: FlowState) {
  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();
  const msgH = flowMsg(wctx);
  const { prompts } = wctx;
  const input = msg.text.trim();
  const num = onlyNumber(input);
  const lower = input.toLowerCase();
  const isShortMenuPick = num !== null && input.length <= 2;

  const hydratedFlow = await hydrateReturningClientData(flow, msg.phone);
  if (hydratedFlow.savedVehicle !== flow.savedVehicle || hydratedFlow.savedVehiclePlate !== flow.savedVehiclePlate || hydratedFlow.loyaltyPoints !== flow.loyaltyPoints) {
    flow = hydratedFlow;
    await saveFlow(msg.phone, flow);
  } else {
    flow = hydratedFlow;
  }

  if (flow.awaitingPostServiceRating) {
    const rating = Number.parseInt(input, 10);
    if (![1, 2, 3, 4, 5].includes(rating)) {
      await sendText({ number: msg.phone, text: "Para registrar sua avaliação, responda somente com uma nota de *1 a 5*. Se preferir, também pode explicar o que aconteceu." });
      return;
    }
    const next: FlowState = { ...flow, awaitingPostServiceRating: false };
    await saveFlow(msg.phone, next);
    if (rating <= 3) {
      await sendText({ number: msg.phone, text: `Obrigado pela sinceridade. Registrei sua nota ${rating} e vou chamar a equipe para entender o que podemos melhorar.`, voiceReply: true });
      await handleHumanHandoffRequest(msg, next);
      return;
    }
    await sendText({ number: msg.phone, text: `Muito obrigado pela avaliação de *${rating} estrelas*! Ficamos felizes em cuidar do seu veículo. Sua opinião ajuda a Garagem do Ka a evoluir.`, voiceReply: true });
    return;
  }

  if (flow.awaitingInitialRequestConfirmation || flow.awaitingInitialRequestCorrection) {
    if (flow.awaitingInitialRequestConfirmation && isNaturalConfirmation(input)) {
      const next: FlowState = {
        ...flow,
        awaitingInitialRequestConfirmation: false,
        awaitingInitialRequestCorrection: false,
        vehicleConfirmed: true,
      };
      await saveFlow(msg.phone, next);
      await sendQuote(msg, next, wctx);
      return;
    }

    if (flow.awaitingInitialRequestConfirmation && wantsInitialCorrection(input)) {
      const next: FlowState = {
        ...flow,
        awaitingInitialRequestConfirmation: false,
        awaitingInitialRequestCorrection: true,
      };
      await saveFlow(msg.phone, next);
      await sendText({
        number: msg.phone,
        text: "Claro 😊 Diga em uma frase o que deseja corrigir.\n_Exemplos: “a cor é preta”, “prefiro sexta à tarde” ou “o serviço é lavagem completa”._",
      });
      return;
    }

    const correction = await applyInitialRequestCorrection(flow, input, wctx);
    if (correction.changed) {
      const next: FlowState = {
        ...correction.next,
        awaitingInitialRequestConfirmation: true,
        awaitingInitialRequestCorrection: false,
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: initialRequestSummaryText(next, wctx) });
      return;
    }

    await sendText({
      number: msg.phone,
      text: flow.awaitingInitialRequestCorrection
        ? "Qual informação deseja corrigir: *nome, veículo, serviço, data ou período*? Pode escrever do seu jeito."
        : "Só para confirmar com segurança: está tudo certo no resumo? Você pode dizer *sim* ou escrever qual informação deseja corrigir.",
    });
    return;
  }

  // Depois de confirmar uma reserva, a conversa termina de forma limpa. Só na
  // próxima mensagem iniciamos uma nova jornada, usando o nome já conhecido e
  // perguntando primeiro se o veículo continua sendo o mesmo.
  if (flow.awaitingPostConfirmationReturn) {
    const next: FlowState = {
      ...flow,
      awaitingPostConfirmationReturn: false,
      awaitingReturningVehicleChoice: true,
      stage: "ETAPA2_MAIN_MENU",
    };
    await saveFlow(msg.phone, next);
    await sendText({
      number: msg.phone,
      text: `Olá, *${clientDisplayName(next, msg.pushName)}*! Que bom falar com você novamente.\n\nO novo atendimento será para o mesmo veículo, *${next.savedVehicle ?? vehicleDisplayFromFlow(next)}${next.savedVehiclePlate ? ` · ${next.savedVehiclePlate}` : ""}*?\n\n*1* ✅ Sim, o mesmo veículo\n*2* 🚗 Não, quero informar outro`,
    });
    return;
  }

  if (flow.awaitingReturningVehicleChoice) {
    if (/^(1|sim|s|mesmo|o mesmo)$/i.test(lower)) {
      const next: FlowState = {
        ...flow,
        awaitingReturningVehicleChoice: false,
        vehicleConfirmed: true,
        stage: "ETAPA2_MAIN_MENU",
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(next, msg.pushName) });
      return;
    }

    if (/^(2|não|nao|n|outro|outro veículo|outro veiculo)$/i.test(lower)) {
      const next: FlowState = {
        ...flow,
        awaitingReturningVehicleChoice: false,
        savedVehicle: null,
        savedVehiclePlate: null,
        vehicleRaw: undefined,
        vehicleModel: undefined,
        vehiclePlate: undefined,
        vehicleYear: undefined,
        vehicleColor: undefined,
        vehicleCondition: undefined,
        vehicleIsSuv: undefined,
        vehicleConfirmed: false,
        stage: "ETAPA2_MAIN_MENU",
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(next, msg.pushName) });
      return;
    }

    await sendText({
      number: msg.phone,
      text: `Vamos usar *${flow.savedVehicle ?? vehicleDisplayFromFlow(flow)}${flow.savedVehiclePlate ? ` · ${flow.savedVehiclePlate}` : ""}* neste atendimento?\n\n*1* ✅ Sim, o mesmo veículo\n*2* 🚗 Não, informar outro`,
    });
    return;
  }

  // DETECÇÃO DE CANCELAMENTO (cross-cutting) - usando core handler unificado
  // Rode antes do switch de etapas para interceptar intenções de cancelamento
  if (flow.awaitingDiscountResponse) {
    await executeCoreHandler(msg, flow, handleDiscountResponse, msg.phone);
    return;
  }

  if (flow.awaitingAiFollowup) {
    if (input === "1" || /^(voltar|continuar)$/i.test(lower)) {
      const next: FlowState = {
        ...flow,
        stage: flow.aiFollowupReturnStage ?? flow.stage,
        awaitingAiFollowup: false,
        aiFollowupReturnStage: undefined,
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: menuForStage(next, wctx, msg.pushName) });
      return;
    }

    if (input === "2" || /^(menu|início|inicio)$/i.test(lower)) {
      const next: FlowState = {
        ...flow,
        stage: "ETAPA2_MAIN_MENU",
        awaitingAiFollowup: false,
        aiFollowupReturnStage: undefined,
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: msgH.mainMenu(next, msg.pushName) });
      return;
    }

    if (input === "3" || input === "9" || wantsHumanHandoff(input)) {
      const next: FlowState = {
        ...flow,
        awaitingAiFollowup: false,
        aiFollowupReturnStage: undefined,
      };
      await saveFlow(msg.phone, next);
      await handleHumanHandoffRequest(msg, next);
      return;
    }

    const resumedFlow: FlowState = {
      ...flow,
      stage: flow.aiFollowupReturnStage ?? flow.stage,
      awaitingAiFollowup: false,
      aiFollowupReturnStage: undefined,
    };

    const followupQuestionByRule = looksLikeQuestion(input);
    const followupAnalysis = followupQuestionByRule
      ? null
      : await analyzeWhatsAppMessage({
          text: input,
          stage: resumedFlow.stage,
          pushName: msg.pushName,
          customerName: resumedFlow.customerName,
          ctx,
        });

    if (followupQuestionByRule || followupAnalysis?.intent === "doubt") {
      const contextualFlow = rememberDoubtService(input, resumedFlow, wctx);
      await saveFlow(msg.phone, contextualFlow);
      const answer = await buildCustomerDoubtAnswer(input, contextualFlow, ctx, wctx, followupAnalysis?.reply);
      await sendText({
        number: msg.phone,
        text: answer,
        voiceReply: true,
      });
      await sendText({ number: msg.phone, text: doubtResumePrompt(contextualFlow), voiceReply: false });
      return;
    }

    // Respostas naturais como "quero agendar", "pode ser" ou o nome de um
    // serviço continuam na etapa pausada, sem obrigar o cliente a escolher 1/2.
    await saveFlow(msg.phone, resumedFlow);
    await processNumberedFlowInternal(msg, resumedFlow);
    return;
  }

  if (await handleGlobalCommands(msg, flow, ctx, wctx, lower, "account")) {
    return;
  }

  if (input === "9" || wantsHumanHandoff(input)) {
    await handleHumanHandoffRequest(msg, flow);
    return;
  }

  const cancellationStages: FlowState["stage"][] = [
    "ETAPA5_QUOTE",
    "ETAPA5_FIRST_TIME_BONUS",
    "ETAPA6_UPSELL",
    "ETAPA7_DAY",
    "ETAPA7_TIME",
    "ETAPA9_COUPON",
    "ETAPA9_LOYALTY",
    "ETAPA10_BUDGET",
  ];
  if ((flow.quoteMin ?? 0) > 0 && cancellationStages.includes(flow.stage)) {
    const cancellationResult = await handleCancellationDetection(flow, input, [], msg.phone);
    if (cancellationResult) {
      await saveFlow(msg.phone, cancellationResult.nextState);
      for (const response of cancellationResult.responses) {
        await sendText({ number: msg.phone, text: response.text });
        await delay(120);
      }
      return;
    }
  }

  // "Tem horário para hoje?" é um pedido de agenda, não uma dúvida genérica.
  // Guardamos a data imediatamente, mas só consultamos slots depois de saber
  // o serviço, pois cada opção bloqueia uma duração diferente na agenda.
  if (!isShortMenuPick && isAvailabilityRequest(input)) {
    const requestedDay = parseDayInput(input, null);
    const mentionedService = detectServiceKey(input);
    const selectedService =
      mentionedService && mentionedService !== "indeciso"
        ? mentionedService
        : flow.serviceKey ?? flow.pendingServiceKey;
    const availabilityFlow: FlowState = {
      ...flow,
      pendingInitialIntent: "schedule",
      dayDate: requestedDay?.dayDate ?? flow.dayDate,
      dayLabel: requestedDay?.dayLabel ?? flow.dayLabel,
      requestedTimePreference:
        detectRequestedTimePreference(input) ?? flow.requestedTimePreference,
      serviceRequestContext: input.slice(0, 500),
    };

    if (!selectedService) {
      await showAvailabilityServiceSelection(msg, availabilityFlow, wctx);
      return;
    }

    if (looksLikeQuestion(input)) {
      const requestedDate = availabilityFlow.dayLabel ?? availabilityFlow.dayDate ?? "a data desejada";
      const serviceLabel = availabilityFlow.serviceLabel ?? wctx.catalog[selectedService]?.label ?? "o serviço escolhido";
      await sendText({
        number: msg.phone,
        text: `Claro. Vou consultar os horários reais para ${requestedDate}, considerando o tempo de ${serviceLabel}.`,
        voiceReply: true,
      });
    }

    if (!flow.serviceKey || flow.serviceKey !== selectedService) {
      await saveFlow(msg.phone, availabilityFlow);
      await activateService(msg, availabilityFlow, selectedService, wctx);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts });
      return;
    }

    await saveFlow(msg.phone, availabilityFlow);
    await sendCalendarWithImageAndList({ number: msg.phone, prompts });
    if (availabilityFlow.stage === "ETAPA7_DAY" && availabilityFlow.dayDate) {
      await proceedToTimeSelection(msg, availabilityFlow, wctx);
      return;
    }

    await sendText({
      number: msg.phone,
      text: `Anotei sua preferência por *${availabilityFlow.dayLabel ?? availabilityFlow.dayDate ?? "esta data"}*. O serviço considerado é *${availabilityFlow.serviceLabel ?? wctx.catalog[selectedService]?.label ?? "o serviço escolhido"}*.\n\n${menuForStage(availabilityFlow, wctx, msg.pushName)}`,
    });
    return;
  }

  // Small talk / confirmações neutras ("pera ai", "ok", "tá", "entendi") em stages intermediárias
  // → responde com lembrete gentil sem quebrar o estado atual
  if (
    !isShortMenuPick &&
    !num &&
    isGreetingOrSmallTalk(input) &&
    flow.stage !== "ETAPA1_AWAITING_NAME" &&
    flow.stage !== "ETAPA2_MAIN_MENU" &&
    flow.stage !== "STALE_RETURN"
  ) {
    await sendText({
      number: msg.phone,
      text: `Claro 😊 ${menuForStage(flow, wctx, msg.pushName)}`,
    });
    return;
  }

  if (
    !isShortMenuPick &&
    !num &&
    flow.stage !== "ETAPA1_AWAITING_NAME"
  ) {
    const questionByRule = looksLikeQuestion(input);
    const analysis = questionByRule
      ? null
      : await analyzeWhatsAppMessage({
          text: input,
          stage: flow.stage,
          pushName: msg.pushName,
          customerName: flow.customerName,
          ctx,
        });

    if (questionByRule || analysis?.intent === "doubt") {
      const contextualFlow = rememberDoubtService(input, flow, wctx);
      if (contextualFlow.pendingServiceKey !== flow.pendingServiceKey) {
        await saveFlow(msg.phone, contextualFlow);
      }
      const answer = await buildCustomerDoubtAnswer(input, contextualFlow, ctx, wctx, analysis?.reply);
      await sendText({
        number: msg.phone,
        text: answer,
        voiceReply: true,
      });
      await sendText({ number: msg.phone, text: doubtResumePrompt(contextualFlow), voiceReply: false });
      return;
    }
  }

  // Informações comerciais têm fallback determinístico, mas só depois de a
  // assistente tentar compreender e responder a dúvida em linguagem natural.
  if (await handleGlobalCommands(msg, flow, ctx, wctx, lower, "business")) {
    return;
  }

  if (
    !isShortMenuPick &&
    flow.customerName &&
    flow.stage !== "ETAPA1_AWAITING_NAME" &&
    flow.stage !== "STALE_RETURN"
  ) {
    const parsedVehicle = parseVehicleMessage(input);
    const serviceKey = detectServiceKey(input);

    if (isValidVehicle(input) && serviceKey && serviceKey !== "indeciso") {
      const merged = { ...storeVehicle(flow, input), serviceKey };
      if (flow.stage === "ETAPA2_MAIN_MENU" || flow.stage === "ETAPA2_SUB") {
        await activateService(msg, merged, serviceKey, wctx);
        return;
      }
    }
  }

  switch (flow.stage) {
    case "STALE_RETURN": {
      const validName = resolveValidCustomerName(flow.customerName ?? msg.pushName);
      if (validName) {
        const next: FlowState = {
          stage: "ETAPA2_MAIN_MENU",
          welcomed: true,
          customerName: validName,
        };
        await saveFlow(msg.phone, next);
        await sendText({ number: msg.phone, text: msgH.mainMenu(next, msg.pushName) });
      } else {
        await sendText({ number: msg.phone, text: etapa1Welcome(ctx, prompts) });
        await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: true });
      }
      return;
    }

    case "ETAPA1_AWAITING_NAME": {
      const detectedServiceKey = detectServiceKey(input);
      const serviceKey = detectedServiceKey && detectedServiceKey !== "indeciso"
        ? detectedServiceKey
        : flow.pendingServiceKey;
      const questionByRule = looksLikeQuestion(input);
      const analysis = questionByRule
        ? null
        : await analyzeWhatsAppMessage({
            text: input,
            stage: flow.stage,
            pushName: msg.pushName,
            ctx,
          });

      if (questionByRule || analysis?.intent === "doubt") {
        const next = rememberDoubtService(input, {
          ...flow,
          pendingInitialIntent: "doubt",
        }, wctx);
        await saveFlow(msg.phone, next);
        const answer = await buildCustomerDoubtAnswer(input, next, ctx, wctx, analysis?.reply);
        await sendText({
          number: msg.phone,
          text: answer,
          voiceReply: true,
        });
        await sendText({
          number: msg.phone,
          text: "Para personalizar o atendimento, como posso te chamar? 😊\n_Envie somente seu primeiro nome._",
          voiceReply: false,
        });
        return;
      }

      const nameFromAi =
        analysis?.intent === "name" && analysis.extractedName
          ? analysis.extractedName.split(/\s+/)[0]
          : null;
      const nameFromInput = looksLikePersonName(input) ? input.split(/\s+/)[0] : null;
      const name = (nameFromAi ?? nameFromInput ?? "").trim();

      // Se o input já for um nome válido, usar diretamente sem pedir confirmação
      if (isValidCustomerName(name)) {
        await ensureClient(msg.phone, name, msg.testMode?.skipDb);
        const next: FlowState = {
          ...flow,
          stage: "ETAPA2_MAIN_MENU",
          customerName: name,
          welcomed: true,
          pendingInitialIntent: undefined,
        };
        if (serviceKey && serviceKey !== "indeciso") {
          await saveFlow(msg.phone, next);
          await activateService(msg, next, serviceKey, wctx);
          return;
        }
        await saveFlow(msg.phone, next);
        await sendText({ number: msg.phone, text: msgH.mainMenu(next, msg.pushName) });
        return;
      }

      const understoodSchedule =
        analysis?.intent === "schedule" ||
        analysis?.intent === "service" ||
        wantsToSchedule(input, num) ||
        Boolean(serviceKey);

      if (understoodSchedule) {
        const next: FlowState = {
          ...flow,
          pendingInitialIntent: serviceKey ? "service" : "schedule",
          pendingServiceKey: serviceKey,
          serviceRequestContext: input.slice(0, 500),
        };
        await saveFlow(msg.phone, next);
        await sendText({
          number: msg.phone,
          text: initialScheduleNameRequest(
            serviceKey ? wctx.catalog[serviceKey]?.label : null,
            prompts
          ),
        });
        return;
      }

      // Se não for um nome válido, verificar se é greeting/small_talk
      if (analysis?.intent === "greeting" || analysis?.intent === "small_talk") {
        const hint = profileDisplayName(msg.pushName);
        await sendText({
          number: msg.phone,
          text:
            analysis.reply ??
            (hint
              ? `Olá! 😊 Para começar, qual é o seu *nome*?\n_(Se for *${hint}*, pode mandar só o nome)_`
              : `Olá! 😊 Para começar, qual é o seu *nome*?\n_(Só o primeiro nome)_`),
        });
        return;
      }

      // Se chegou aqui, o nome não é válido
      const hint = profileDisplayName(msg.pushName);
      await sendText({
        number: msg.phone,
        text: hint
          ? `Entendi sua mensagem. Para personalizar o atendimento, como posso te chamar?\n_(Se for *${hint}*, envie apenas esse primeiro nome)_`
          : `Entendi sua mensagem. Para personalizar o atendimento, envie somente seu *primeiro nome* 😊`,
      });
      return;
    }

    case "ETAPA2_MAIN_MENU": {
      // A opção 9 faz parte do menu oficial e não pode passar pelo limite das
      // categorias (1–8). Sem esse tratamento, o cliente via uma opção que
      // nunca acionava o atendimento humano.
      if (input === "9") {
        await handleHumanHandoffRequest(msg, flow);
        return;
      }

      // O calendário pode ser exibido enquanto ainda aguardamos o serviço.
      // Se o cliente tocar em um dia, preserve a escolha e continue pedindo o
      // serviço necessário para calcular os horários, em vez de perder o fluxo.
      if (flow.pendingInitialIntent === "schedule" && !flow.serviceKey) {
        const selectedDay = parseDayInput(input, null);
        if (selectedDay) {
          const next: FlowState = { ...flow, ...selectedDay };
          await saveFlow(msg.phone, next);
          await sendText({
            number: msg.phone,
            text: availabilityServiceSelectionText(next, wctx, msg.pushName),
          });
          return;
        }
      }

      if (wantsRefusal(input)) {
        const reset: FlowState = {
          stage: "ETAPA2_MAIN_MENU",
          welcomed: true,
          customerName: resolveValidCustomerName(flow.customerName) ?? undefined,
        };
        await saveFlow(msg.phone, reset);
        await sendText({
          number: msg.phone,
          text: `Sem problemas 😊\n\n${msgH.mainMenu(reset, msg.pushName)}`,
        });
        return;
      }

      const catFromText = detectCategoryNum(input);
      const serviceFromText = detectServiceKey(input);
      const pick = num && num >= 1 && num <= MAIN_MENU_CATEGORIES ? num : catFromText;

      if (serviceFromText && serviceFromText !== "indeciso") {
        await activateService(msg, { ...flow, serviceRequestContext: input.slice(0, 500) }, serviceFromText, wctx);
        return;
      }

      if (!pick) {
        if (isGreetingOrSmallTalk(input)) {
          await sendText({
            number: msg.phone,
            text: msgH.mainMenu(flow, msg.pushName),
          });
          return;
        }
        const clarification = await buildFriendlyFallback(input, flow.stage, flow.serviceLabel);
        await sendText({
          number: msg.phone,
          text: clarification ?? "Não entendi qual cuidado você procura. Conte em uma frase o que deseja melhorar no veículo — por exemplo, pintura sem brilho, bancos manchados ou uma lavagem completa.",
        });
        return;
      }

      if (pick === MAIN_MENU_CATEGORIES) {
        const next: FlowState = {
          ...flow,
          stage: "ETAPA10_FAQ",
          awaitingServiceRecommendation: true,
          serviceRecommendation: null,
          serviceRecommendationKey: null,
          returnStage: "ETAPA2_MAIN_MENU",
        };
        await saveFlow(msg.phone, next);
        await sendText({
          number: msg.phone,
          text: "Conte o que você quer melhorar no veículo — por exemplo: manchas no banco, pintura sem brilho, proteção para carro novo ou uma limpeza completa. A assistente com IA vai comparar apenas os serviços disponíveis e indicar a opção mais adequada.",
        });
        return;
      }

      const cat = wctx.categories[pick];
      if (cat && cat.keys.length === 1) {
        await activateService(msg, flow, cat.keys[0], wctx);
        return;
      }

      await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_SUB", categoryNum: pick });
      await sendText({ number: msg.phone, text: msgH.subMenu(pick) });
      return;
    }

    case "ETAPA2_SUB": {
      if (num === 0 || lower === "voltar" || lower === "menu") {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({
          number: msg.phone,
          text: msgH.mainMenu(flow, msg.pushName),
        });
        return;
      }
      const cat = flow.categoryNum ? wctx.categories[flow.categoryNum] : null;
      const serviceFromText = detectServiceKey(input);
      if (cat && serviceFromText && cat.keys.includes(serviceFromText)) {
        await activateService(msg, { ...flow, serviceRequestContext: input.slice(0, 500) }, serviceFromText, wctx);
        return;
      }
      if (!cat || !num || num < 1 || num > cat.keys.length) {
        await sendText({
          number: msg.phone,
          text: cat
            ? `Qual opção de *${cat.title}* combina com o que você precisa? Pode escrever o nome do serviço ou usar um dos números mostrados.`
            : "Não consegui identificar a categoria. Diga em uma frase o que você quer melhorar no veículo.",
        });
        return;
      }
      const key = cat.keys[num - 1];
      await activateService(msg, flow, key, wctx);
      return;
    }

    case "ETAPA3_UNDECIDED_VEHICLE": {
      const collected = await mergeVehicleDetails(flow, input);
      if (!collected.recognized) {
        await sendText({ number: msg.phone, text: vehicleNotUnderstood(prompts) });
        return;
      }
      if (!hasVehicleInFlow(collected.next)) {
        await saveFlow(msg.phone, collected.next);
        await sendText({ number: msg.phone, text: vehicleMissingCopy(collected.next, prompts) });
        return;
      }
      await saveFlow(msg.phone, { ...collected.next, stage: "ETAPA3_UNDECIDED_PROBLEM" });
      await sendText({ number: msg.phone, text: indecisiveProblemPrompt(prompts) });
      return;
    }

    case "ETAPA3_UNDECIDED_PROBLEM": {
      const issue = num ?? 5;
      const key = UNDECIDED_TO_KEY[issue] ?? "lavagem_detalhada";
      const item = wctx.catalog[key];
      await saveFlow(msg.phone, {
        ...flow,
        stage: "ETAPA3_SERVICE_ACTION",
        serviceKey: key,
        serviceLabel: item.label,
        undecidedIssue: issue,
      });
      await sendText({
        number: msg.phone,
        text: `Para seu caso, recomendo *${item.label}* ✨\n\n${flowMsg(wctx).detail(key)}`,
      });
      return;
    }

    case "ETAPA3_PACKAGE_ACTION": {
      if (num === 4) {
        await handleHumanHandoffRequest(msg, flow);
        return;
      }
      if (wantsOtherServices(input, num, 3)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: msgH.mainMenu(flow, msg.pushName) });
        return;
      }
      if (num === 2) {
        await sendText({
          number: msg.phone,
          text: packageActionText(prompts),
        });
        return;
      }
      if (!wantsToSchedule(input, num) && !isNaturalConfirmation(input)) {
        await sendText({
          number: msg.phone,
          text: "Quer *agendar um pacote*, *comparar as opções* ou *voltar aos serviços avulsos*? Pode responder com suas palavras.",
        });
        return;
      }
      flow.packageKey = "Pacote escolhido";
      if (hasVehicleInFlow(flow)) {
        await sendQuote(msg, flow, wctx);
        return;
      }
      await goToVehicleStep(msg, flow, wctx);
      return;
    }

    case "ETAPA3_SERVICE_ACTION": {
      if (num === 4) {
        await handleHumanHandoffRequest(msg, flow);
        return;
      }
      if (wantsOtherServices(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: msgH.mainMenu(flow, msg.pushName) });
        return;
      }
      if (wantsDoubt(input, num)) {
        await executeCoreHandler(msg, flow, handleServiceQuestion);
        return;
      }
      if (!wantsToSchedule(input, num) && !isNaturalConfirmation(input)) {
        await sendText({
          number: msg.phone,
          text: "Quer agendar este serviço, conhecer outra opção ou tirar uma dúvida? Pode responder naturalmente.",
        });
        return;
      }
      if (hasVehicleInFlow(flow)) {
        await sendQuote(msg, flow, wctx);
        return;
      }
      await goToVehicleStep(msg, flow, wctx);
      return;
    }

    case "ETAPA4_VEHICLE": {
      const confirmAnswer = input.toLowerCase().trim();

      if (flow.awaitingSavedVehicleChoice) {
        if (/^(1|sim|s|usar|confirmo)$/i.test(confirmAnswer)) {
          const next: FlowState = {
            ...flow,
            awaitingSavedVehicleChoice: false,
            vehicleCollectStep: hasVehicleInFlow(flow) ? undefined : "details",
          };
          await saveFlow(msg.phone, next);
          await sendText({
            number: msg.phone,
            text: hasVehicleInFlow(next)
              ? etapa4VehicleConfirmation(
                  next.vehicleModel ?? "",
                  next.vehicleYear ?? "",
                  next.vehiclePlate ?? "",
                  next.vehicleColor ?? "",
                  next.vehicleCondition ?? "",
                  prompts
                )
              : vehicleMissingCopy(next, prompts),
          });
          return;
        }

        if (/^(2|não|nao|n|outro)$/i.test(confirmAnswer)) {
          const next: FlowState = {
            ...beginVehicleCollection(flow, true),
            awaitingSavedVehicleChoice: false,
          };
          await saveFlow(msg.phone, next);
          await sendText({ number: msg.phone, text: etapa4Vehicle(false, prompts) });
          return;
        }

        await sendText({
          number: msg.phone,
          text: `Veículo salvo: *${flow.savedVehicle ?? flow.vehicleModel ?? "não identificado"}*.\n\n*1* — Usar este veículo\n*2* — Informar outro veículo`,
        });
        return;
      }

      const awaitingVehicleConfirmation = !flow.vehicleCollectStep && hasVehicleInFlow(flow);

      if (awaitingVehicleConfirmation) {
        if (/^(1|sim|s|confirmo|correto)$/i.test(confirmAnswer)) {
          flow.vehicleConfirmed = true;
          await saveFlow(msg.phone, flow);
          await sendQuote(msg, flow, wctx);
          return;
        }

        if (/^(nao|não|n|2)$/i.test(confirmAnswer)) {
          const nextFlow = {
            ...beginVehicleCollection(flow, true),
            vehicleConfirmed: false,
          };
          await saveFlow(msg.phone, nextFlow);
          await sendText({ number: msg.phone, text: etapa4Vehicle(false, prompts) });
          return;
        }

        const correction = await mergeVehicleDetails(flow, input);
        const changed = ["vehicleModel", "vehicleYear", "vehiclePlate", "vehicleColor", "vehicleCondition"].some(
          (field) => correction.next[field as keyof FlowState] !== flow[field as keyof FlowState]
        );
        if (correction.recognized && changed) {
          await saveFlow(msg.phone, correction.next);
          await sendText({
            number: msg.phone,
            text: hasVehicleInFlow(correction.next)
              ? etapa4VehicleConfirmation(
                  correction.next.vehicleModel ?? "",
                  correction.next.vehicleYear ?? "",
                  correction.next.vehiclePlate ?? "",
                  correction.next.vehicleColor ?? "",
                  correction.next.vehicleCondition ?? "",
                  prompts
                )
              : vehicleMissingCopy(correction.next, prompts),
          });
          return;
        }

        await sendText({
          number: msg.phone,
          text: `Escolha *1* para confirmar, *2* para informar outro veículo ou escreva diretamente o dado que deseja corrigir.\n\n${etapa4VehicleConfirmation(
            flow.vehicleModel ?? "",
            flow.vehicleYear ?? "",
            flow.vehiclePlate ?? "",
            flow.vehicleColor ?? "",
            flow.vehicleCondition ?? "",
            prompts
          )}`,
        });
        return;
      }

      const collected = await mergeVehicleDetails(flow, input);
      if (!collected.recognized) {
        await sendText({ number: msg.phone, text: vehicleNotUnderstood(prompts) });
        return;
      }

      await saveFlow(msg.phone, collected.next);
      await sendText({
        number: msg.phone,
        text: hasVehicleInFlow(collected.next)
          ? etapa4VehicleConfirmation(
              collected.next.vehicleModel ?? "",
              collected.next.vehicleYear ?? "",
              collected.next.vehiclePlate ?? "",
              collected.next.vehicleColor ?? "",
              collected.next.vehicleCondition ?? "",
              prompts
            )
          : vehicleMissingCopy(collected.next, prompts),
      });
      return;
    }


    case "ETAPA5_QUOTE": {
      if (wantsOtherServices(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: msgH.mainMenu(flow, msg.pushName) });
        return;
      }
      if (wantsDoubt(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA10_FAQ", returnStage: "ETAPA5_QUOTE" });
        await sendText({ number: msg.phone, text: `Pode mandar sua dúvida 😊 Digite *voltar* quando quiser.` });
        return;
      }
      if (!wantsToSchedule(input, num)) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(
            `*1* 📅 Agendar agora\n*2* 🔄 Ver outro serviço\n*3* 💬 Tenho dúvidas antes`
          ),
        });
        return;
      }

      if (!flow.quoteMin || flow.quoteMin <= 0) {
        await sendText({ number: msg.phone, text: evaluationRequired(prompts) });
        await handleHumanHandoffRequest(msg, flow);
        return;
      }

      // Check if first-time customer for bonus (unificado com test-bot)
      if (!flow.firstTimeBonusApplied && !flow.couponCode) {
        try {
          const eligibleForBonus = await isFirstTimeCustomer(normalizePhone(msg.phone));

          if (eligibleForBonus) {
            flow.isFirstTimeCustomer = true;

            const coupon = await findCouponByCode("PRIMEIRA10");
            let canOfferCoupon = false;
            if (coupon?.active) {
              if (msg.testMode?.skipDb) {
                canOfferCoupon = true;
              } else {
                const clientId = await prisma.client
                  .findUnique({ where: { phone: normalizePhone(msg.phone) }, select: { id: true } })
                  .then((client) => client?.id);
                canOfferCoupon = Boolean(clientId) && Boolean(clientId && (await canRedeem(coupon.id, clientId)).ok);
              }
            }

            if (coupon && canOfferCoupon) {
              flow.firstTimeBonusCouponId = coupon.id;
              flow.firstTimeBonusDiscount = Math.min(
                flow.quoteMin ?? 0,
                coupon.type === "percent"
                  ? (flow.quoteMin ?? 0) * (Number(coupon.amount) / 100)
                  : Number(coupon.amount)
              );

              flow.stage = "ETAPA5_FIRST_TIME_BONUS";
              await saveFlow(msg.phone, flow);
              await sendText({
                number: msg.phone,
                text: firstTimeBonusOffer(
                  flow.customerName,
                  flow.firstTimeBonusDiscount,
                  calculateFlowTotal({ ...flow, firstTimeBonusApplied: true, quoteDiscountMode: "base" }),
                  prompts
                ),
              });
              return;
            }

            // Benefício não configurado ou já utilizado: segue sem criar
            // desconto informal que não possa ser auditado no CRM.
            flow.firstTimeBonusApplied = true;
            await saveFlow(msg.phone, flow);
          } else {
            flow.firstTimeBonusApplied = true;
            await saveFlow(msg.phone, flow);
          }
        } catch (error) {
          console.error("[ETAPA5_QUOTE] Error checking first-time customer:", error);
          flow.firstTimeBonusApplied = true;
          await saveFlow(msg.phone, flow);
        }
      }

      if (flow.upsellOffered) {
        flow.stage = "ETAPA7_DAY";
        await saveFlow(msg.phone, flow);
        await sendCalendarWithImageAndList({ number: msg.phone, prompts });
        return;
      }
      const key = flow.serviceKey ?? "lavagem_detalhada";
      const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
      if (!upsell) {
        flow.stage = "ETAPA7_DAY";
        await saveFlow(msg.phone, flow);
        await sendCalendarWithImageAndList({ number: msg.phone, prompts });
        return;
      }
      flow.upsellLabel = upsell.complement;
      flow.upsellValue = upsell.value;
      flow.upsellDurationMin = upsell.durationMin;
      flow.upsellOffered = true;
      flow.stage = "ETAPA6_UPSELL";
      await saveFlow(msg.phone, flow);
      // Alinhado com test-bot: formato simples de upsell
      // Usar valor estimado baseado na diferença entre quoteMax e quoteMin
      const upsellValue = upsell.value;
      await sendText({
        number: msg.phone,
        text: upsellOffer(flow.serviceLabel ?? "seu serviço", upsell.complement, upsell.benefit, upsellValue, prompts),
      });
      return;
    }

    case "ETAPA5_FIRST_TIME_BONUS": {
      if (num === 1 || /sim|s|yes|quero|aceito/i.test(lower)) {
        flow.firstTimeBonusApplied = true;
        flow.quoteDiscountMode = "base";
        if (flow.firstTimeBonusCouponId) {
          flow.couponId = flow.firstTimeBonusCouponId;
          flow.couponCode = "PRIMEIRA10";
          flow.couponDiscountApplied = flow.firstTimeBonusDiscount ?? 0;
        }
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: firstTimeBonusApplied(calculateFlowTotal(flow), prompts),
        });
        // Continue to upsell or calendar
        if (flow.upsellOffered) {
          flow.stage = "ETAPA7_DAY";
          await saveFlow(msg.phone, flow);
          await sendCalendarWithImageAndList({ number: msg.phone, prompts });
        } else {
          const key = flow.serviceKey ?? "lavagem_detalhada";
          const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
          if (upsell) {
            flow.upsellLabel = upsell.complement;
            flow.upsellValue = upsell.value;
            flow.upsellDurationMin = upsell.durationMin;
            flow.upsellOffered = true;
            flow.stage = "ETAPA6_UPSELL";
            await saveFlow(msg.phone, flow);
            const upsellValue = upsell.value;
            await sendText({
              number: msg.phone,
              text: upsellOffer(flow.serviceLabel ?? "seu serviço", upsell.complement, upsell.benefit, upsellValue, prompts),
            });
          } else {
            flow.stage = "ETAPA7_DAY";
            await saveFlow(msg.phone, flow);
            await sendCalendarWithImageAndList({ number: msg.phone, prompts });
          }
        }
        return;
      }

      if (num === 2 || /nao|não|n|no|nao quero/i.test(lower)) {
        flow.firstTimeBonusApplied = true;
        flow.isFirstTimeCustomer = false;
        flow.firstTimeBonusDiscount = 0;
        flow.firstTimeBonusCouponId = undefined;
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: firstTimeBonusDeclined(calculateFlowTotal(flow), prompts),
        });
        // Continue to upsell or calendar
        if (flow.upsellOffered) {
          flow.stage = "ETAPA7_DAY";
          await saveFlow(msg.phone, flow);
          await sendCalendarWithImageAndList({ number: msg.phone, prompts });
        } else {
          const key = flow.serviceKey ?? "lavagem_detalhada";
          const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
          if (upsell) {
            flow.upsellLabel = upsell.complement;
            flow.upsellValue = upsell.value;
            flow.upsellDurationMin = upsell.durationMin;
            flow.upsellOffered = true;
            flow.stage = "ETAPA6_UPSELL";
            await saveFlow(msg.phone, flow);
            const upsellValue = upsell.value;
            await sendText({
              number: msg.phone,
              text: upsellOffer(flow.serviceLabel ?? "seu serviço", upsell.complement, upsell.benefit, upsellValue, prompts),
            });
          } else {
            flow.stage = "ETAPA7_DAY";
            await saveFlow(msg.phone, flow);
            await sendCalendarWithImageAndList({ number: msg.phone, prompts });
          }
        }
        return;
      }

      await sendText({
        number: msg.phone,
        text: invalidMenu(`*1* ✅ Quero o desconto\n*2* ❌ Não, obrigado`),
      });
      return;
    }

    case "ETAPA6_UPSELL": {
      const upsellDecision = num === 1 ? true : num === 2 ? false : parseYesNo(input);
      if (upsellDecision === null) {
        await sendText({
          number: msg.phone,
          text: "Deseja incluir a proteção recomendada? Pode dizer *sim, quero incluir* ou *não, seguir sem ela*.",
        });
        return;
      }
      flow.upsellAccepted = upsellDecision;
      if (upsellDecision) {
        const upsell = getUpsellForKey(flow.serviceKey ?? "lavagem_detalhada", wctx);
        if (upsell) {
          flow.upsellLabel = upsell.complement;
          flow.upsellValue = upsell.value;
          flow.upsellDurationMin = upsell.durationMin;
          await sendText({
            number: msg.phone,
            text: upsellAdded(upsell.complement, prompts),
          });
        }
      }
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts });
      return;
    }

    case "ETAPA7_PERIOD": {
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts });
      return;
    }

    case "ETAPA7_DAY":
    case "ETAPA7_CUSTOM_DAY": {
      if (input === "0" || /^(menu|voltar|cancelar)$/i.test(lower)) {
        const next: FlowState = { ...flow, stage: "ETAPA2_MAIN_MENU" };
        await saveFlow(msg.phone, next);
        await sendText({ number: msg.phone, text: msgH.mainMenu(next, msg.pushName) });
        return;
      }

      const dayParsed = parseDayInput(input, num);
      if (!dayParsed) {
        await sendText({
          number: msg.phone,
          text: "Não consegui identificar a data com segurança. Envie algo como *amanhã*, *sexta* ou *15/08* — ou escolha diretamente no calendário acima.",
        });
        return;
      }
      flow.dayLabel = dayParsed.dayLabel;
      flow.dayDate = dayParsed.dayDate;
      await proceedToTimeSelection(msg, flow, wctx);
      return;
    }

    case "ETAPA7_TIME": {
      
      

      const slots = flow.availableSlots ?? [];

      const durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow, wctx));
      const chosen = parseTimeSelection(input, slots);

      if (!chosen) {
        const looksLikeTimeAttempt = /^\d+$/.test(input.trim()) || /\d{1,2}[:h]\d{2}/.test(input.trim());
        if (looksLikeTimeAttempt) {
          await sendText({
            number: msg.phone,
            text: slotUnavailable(
              flow.dayLabel ?? flow.dayDate ?? "este dia",
              slots.map((slot, index) => `*${index + 1}* — ${slot}`).join("\n"),
              prompts
            ),
          });
          return;
        }

        await sendText({
          number: msg.phone,
          text: `Qual horário você prefere? Pode escrever, por exemplo, *09:00*, ou usar o número ao lado de uma opção.\n\n${etapa7Time(flow.dayLabel ?? flow.dayDate ?? "o dia", slots, formatDurationLabel(durationMin), prompts)}`,
        });
        return;
      }

      if (flow.dayDate) {
        let fresh: string[] = [];
        try {
          fresh = await generateAvailableSlots(flow.dayDate, durationMin);
        } catch (error) {
          if (!flowDeliveryContext.getStore()?.skipDb) throw error;
          fresh = slots;
        }
        if (fresh.length === 0 && flowDeliveryContext.getStore()?.skipDb) {
          fresh = slots;
        }
        if (!fresh.includes(chosen)) {
          flow.availableSlots = fresh;
          await saveFlow(msg.phone, flow);
          await sendText({
            number: msg.phone,
            text: slotUnavailable(
              flow.dayLabel ?? flow.dayDate ?? "este dia",
              fresh.map((slot, index) => `*${index + 1}* — ${slot}`).join("\n"),
              prompts
            ),
          });
          return;
        }
      }

      flow.startTime = chosen;
      flow.periodLabel = chosen;
      flow.stage = "ETAPA9_COUPON";
      await saveFlow(msg.phone, flow);
      await sendText({
        number: msg.phone,
        text: etapa9Coupon(prompts),
      });
      return;
    }

    case "ETAPA9_COUPON": {
      await executeCoreHandler(msg, flow, handleCouponStep, msg.phone);
      return;
    }

    case "ETAPA9_LOYALTY": {
      await executeCoreHandler(msg, flow, handleLoyaltyStep);
      return;
    }

    case "ETAPA10_BUDGET": {
      // handleLoyaltyStep já mostra o orçamento e pede confirmação
      // Esta etapa apenas captura a resposta do usuário após ver o orçamento
      if (/(sim|s|1|yes|quero|agendar)/i.test(lower)) {
        flow.stage = "ETAPA10_LOGISTICS";
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: etapa10Logistics(prompts),
        });
        return;
      }

      if (/(nao|não|n|2|no|cancelar|alterar)/i.test(lower)) {
        flow.stage = "ETAPA2_MAIN_MENU";
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: `Sem problemas! ${msgH.mainMenu(flow, msg.pushName)}`,
        });
        return;
      }

      await sendText({
        number: msg.phone,
        text: invalidMenu(
          `*1* ✅ Sim, confirmar\n*2* ❌ Não, voltar ao menu`
        ),
      });
      return;
    }

    // ETAPA9_PICKUP, ETAPA9_PICKUP_ADDRESS, ETAPA9_RETURN_PREFERENCE removidos
    // Agora são tratados unificados pelo handleLogistics (ETAPA10_LOGISTICS)

    // NOVA ETAPA: Logística combinada (unificado com test-bot)
    case "ETAPA10_LOGISTICS": {
      await executeCoreHandler(msg, flow, handleLogistics);
      return;
    }

    case "ETAPA8_PAYMENT": {
      if (await applyCouponPhase(msg, flow, lower, ctx, wctx, num, input)) return;
      await handlePayment(msg, flow, ctx, num, lower, wctx);
      return;
    }

    case "ETAPA8_PAYMENT_NO_PIX": {
      if (await applyCouponPhase(msg, flow, lower, ctx, wctx, num, input)) return;
      await handlePayment(msg, flow, ctx, num, lower, wctx);
      return;
    }

    case "ETAPA8_PAYMENT_CARD_TYPE": {
      if (num === 1 || /d[eé]bito/i.test(lower)) {
        flow.paymentMethod = "Cartão de débito";
        flow.stage = "ETAPA14_REMINDER";
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: reminderChoice(prompts),
        });
        return;
      }
      if (num === 2 || /cr[eé]dito/i.test(lower)) {
        flow.paymentMethod = "Cartão de crédito";
        flow.stage = "ETAPA14_REMINDER";
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: reminderChoice(prompts),
        });
        return;
      }
      await sendText({
        number: msg.phone,
        text: "O cartão será de *débito* ou *crédito*? Pode escrever a modalidade.",
      });
      return;
    }

    case "ETAPA8_PIX_CHOICE": {
      await executeCoreHandler(msg, flow, handlePixChoice);
      return;
    }

    case "ETAPA8_RECEIPT_UPLOAD": {
      // Usar o core handler para processamento de comprovante
      await executeCoreHandler(msg, flow, handleReceiptUpload, msg.phone);
      return;
    }

    case "ETAPA14_REMINDER": {
      await executeCoreHandler(msg, flow, handleReminderStep, msg.pushName);
      return;
    }

    case "ETAPA15_SUMMARY_CONFIRM": {
      const result = await executeCoreHandler(msg, flow, handleSummaryConfirm);
      if (result.nextState.stage === "ETAPA16_CONFIRMATION") {
        await confirmFinal(msg, result.nextState, ctx, wctx);
      }
      return;
    }

    case "ETAPA16_CONFIRMATION": {
      // Compatibilidade com sessões iniciadas antes da confirmação atômica.
      await confirmFinal(msg, flow, ctx, wctx);
      return;
    }

    case "ETAPA10_FAQ": {
      if (input === "3" || input === "9" || wantsHumanHandoff(input)) {
        await handleHumanHandoffRequest(msg, flow);
        return;
      }
      if (flow.awaitingServiceRecommendation || flow.serviceRecommendation) {
        await executeCoreHandler(msg, flow, handleFAQ);
        return;
      }
      await executeCoreHandler(msg, flow, handleServiceQuestion);
      return;
    }

    default: {
      console.warn("[Flow] Stage inesperada:", flow.stage, "— redirecionando para menu principal");
      const reset: FlowState = {
        stage: "ETAPA2_MAIN_MENU",
        welcomed: true,
        customerName: resolveValidCustomerName(flow.customerName) ?? undefined,
      };
      await saveFlow(msg.phone, reset);
      await sendText({ number: msg.phone, text: msgH.mainMenu(reset, msg.pushName) });
    }
  }
}

function doubtResumePrompt(flow: FlowState): string {
  switch (flow.stage) {
    case "ETAPA2_MAIN_MENU":
    case "ETAPA2_SUB":
      return "_Se quiser agendar, diga em uma frase qual cuidado seu veículo precisa._";
    case "ETAPA3_SERVICE_ACTION":
    case "ETAPA3_PACKAGE_ACTION":
    case "ETAPA5_QUOTE":
      return "_Se fizer sentido para você, pode dizer “quero agendar” — ou mandar outra dúvida._";
    case "ETAPA4_VEHICLE":
    case "ETAPA4_VEHICLE_CONFIRM":
      return "_Quando quiser continuar, envie ou confirme os dados do veículo._";
    case "ETAPA7_DAY":
      return "_Quando quiser continuar, escolha a data no calendário enviado._";
    case "ETAPA7_TIME":
      return "_Quando quiser continuar, envie o horário desejado._";
    case "ETAPA9_COUPON":
    case "ETAPA9_LOYALTY":
      return "_Quando quiser continuar, informe o cupom ou diga que prefere seguir sem ele._";
    case "ETAPA10_LOGISTICS":
      return "_Quando quiser continuar, diga se vai levar o veículo ou se precisa de leva e traz._";
    case "ETAPA8_PAYMENT":
    case "ETAPA8_PAYMENT_NO_PIX":
    case "ETAPA8_PAYMENT_CARD_TYPE":
    case "ETAPA8_PIX_CHOICE":
      return "_Quando quiser continuar, informe como prefere pagar._";
    case "ETAPA14_REMINDER":
      return "_Quando quiser continuar, diga se deseja receber o lembrete._";
    case "ETAPA15_SUMMARY_CONFIRM":
      return "_Quando quiser continuar, confirme o resumo do agendamento._";
    default:
      return "_Continuamos exatamente de onde paramos quando você quiser._";
  }
}

function controlledDoubtFallback(question: string, flow: FlowState, wctx: WhatsAppCatalogContext): string {
  const serviceKey = detectServiceKey(question) ?? flow.pendingServiceKey ?? flow.serviceKey;
  const service = serviceKey ? wctx.catalog[serviceKey] : null;
  const asksPrice = /quanto|preço|preco|valor|custa|custo/i.test(question);

  if (asksPrice && service) {
    const min = flow.serviceKey === serviceKey && (flow.quoteMin ?? 0) > 0
      ? Number(flow.quoteMin)
      : Number(service.hatchMin || 0);
    const max = flow.serviceKey === serviceKey && (flow.quoteMax ?? 0) > 0
      ? Number(flow.quoteMax)
      : Number(service.hatchMax || min);

    if (min > 0) {
      const price = min === max
        ? `R$ ${min.toFixed(2).replace(".", ",")}`
        : `R$ ${min.toFixed(2).replace(".", ",")} a R$ ${max.toFixed(2).replace(".", ",")}`;
      return `O *${service.label}* tem estimativa de *${price}*. O valor final é confirmado após avaliarmos o veículo, porque tamanho e condição podem alterar o trabalho necessário.`;
    }

    return `O valor do *${service.label}* é definido após uma avaliação rápida do veículo, porque depende do estado da pintura e do nível de correção necessário. Posso organizar essa avaliação para você.`;
  }

  if (service) {
    return `Posso te orientar sobre *${service.label}*. Para dar uma resposta segura sobre o seu caso, preciso considerar o estado e o modelo do veículo; se necessário, nossa equipe confirma os detalhes na avaliação.`;
  }

  return "Entendi sua dúvida. Não consegui consultar a IA neste instante sem correr o risco de inventar uma informação; você pode reformular a pergunta ou pedir um especialista da equipe.";
}

function catalogGroundedDoubtAnswer(
  question: string,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): string | null {
  const serviceKey = detectServiceKey(question) ?? flow.pendingServiceKey ?? flow.serviceKey;
  const service = serviceKey ? wctx.catalog[serviceKey] : null;
  if (!service) return null;

  if (/tempo|demora|duração|duracao|leva\b/i.test(question)) {
    const estimatedTime = String(service.time || "").trim();
    if (!estimatedTime || /consulta|avalia/i.test(estimatedTime)) {
      return `O tempo do *${service.label}* é confirmado após avaliarmos a pintura, porque varia conforme o nível de correção necessário. Assim conseguimos passar um prazo responsável, sem estimar algo que pode não corresponder ao seu veículo.`;
    }
    return `O *${service.label}* leva aproximadamente *${estimatedTime}*. Esse tempo pode ser ajustado após avaliarmos o tamanho e a condição do veículo.`;
  }

  if (/\b(lavam|lava|fazem|faz|oferecem|oferece|trabalham|realizam|tem|têm)\b/i.test(question)) {
    const time = String(service.time || "").trim();
    const timeText = time && !/consulta|avalia/i.test(time)
      ? ` O tempo estimado é de *${time}*.`
      : " O tempo é confirmado após a avaliação do veículo.";
    const min = Number(service.hatchMin || 0);
    const max = Number(service.hatchMax || min);
    const priceText = min > 0
      ? min === max
        ? ` A estimativa é de *R$ ${min.toFixed(2).replace(".", ",")}*.`
        : ` A estimativa fica entre *R$ ${min.toFixed(2).replace(".", ",")} e R$ ${max.toFixed(2).replace(".", ",")}*.`
      : " O valor é definido após a avaliação.";
    return `Sim, realizamos *${service.label}*. ${service.short}${timeText}${priceText}`;
  }

  if (/quanto|preço|preco|valor|custa|custo/i.test(question)) {
    return controlledDoubtFallback(question, flow, wctx);
  }

  return null;
}

function rememberDoubtService(
  question: string,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): FlowState {
  const serviceKey = detectServiceKey(question) ?? flow.pendingServiceKey ?? flow.serviceKey;
  if (!serviceKey || !wctx.catalog[serviceKey]) return flow;
  return {
    ...flow,
    pendingServiceKey: serviceKey,
  };
}

async function buildCustomerDoubtAnswer(
  question: string,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  analyzedReply?: string
): Promise<string> {
  const serviceKey = detectServiceKey(question) ?? flow.pendingServiceKey ?? flow.serviceKey;
  const service = serviceKey ? wctx.catalog[serviceKey] : null;
  const doubtFlow: FlowState = service
    ? {
        ...flow,
        serviceLabel: service.label,
        estimatedTime: service.time,
        quoteMin: service.hatchMin > 0 ? service.hatchMin : undefined,
        quoteMax: service.hatchMax > 0 ? service.hatchMax : undefined,
      }
    : flow;
  const groundedAnswer = catalogGroundedDoubtAnswer(question, doubtFlow, wctx);
  if (groundedAnswer) return groundedAnswer;
  const aiAnswer = await answerCustomerDoubt({ question, flow: doubtFlow, ctx, wctx });
  return aiAnswer || analyzedReply?.trim() || controlledDoubtFallback(question, flow, wctx);
}

function menuForStage(flow: FlowState, wctx: WhatsAppCatalogContext, pushName?: string): string {
  const msgH = flowMsg(wctx);
  switch (flow.stage) {
    case "ETAPA2_MAIN_MENU":
      return msgH.mainMenu(flow, pushName);
    case "ETAPA5_QUOTE":
      return `*1* Agendar | *2* Outro serviço | *3* Dúvida`;
    case "ETAPA3_SERVICE_ACTION":
      return serviceActionMenu(wctx.prompts);
    default:
      return `Digite *menu* para ver opções.`;
  }
}

function parseYesNo(input: string): boolean | null {
  const lower = input.toLowerCase().trim();
  if (/^(1|sim|s|quero|yes|com|buscar|entrega|delivery|levar|levem|vai|pode ser|claro|confirmo|isso mesmo|vamos nessa|inclui|incluir)$/i.test(lower)) return true;
  if (/^(2|nao|não|n|sem|não quero|na loja|trazer|vou levar|pular|skip|prefiro sem|seguir sem|só o serviço|so o servico)$/i.test(lower)) return false;
  return null;
}

async function applyCouponPhase(
  msg: IncomingMessage,
  flow: FlowState,
  lower: string,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  num: number | null,
  input: string
): Promise<boolean> {
  // Aceitar cupom apenas antes de escolher pagamento
  // Não interromper quando o usuário digita número do menu (1..4)
  const isPaymentMenuPick = num !== null;
  if (isPaymentMenuPick) return false;

  const code = parseCouponCodeFromText(input) ?? null;
  if (!code) {
    // Se usuário só perguntar “tenho cupom?”, não tem código ainda
      if (/\b(cupom|c[oó]digo|desconto)\b/i.test(input) && !flow.couponCode) {
        await sendText({
          number: msg.phone,
          text: couponCodeRequest(wctx.prompts),
      });
    }
    return false;
  }

  if (flow.couponId || flow.couponCode) {
    await sendText({
      number: msg.phone,
      text: "Um benefício já está aplicado a esta reserva. Para manter o valor correto, utilizamos apenas um cupom por atendimento.",
    });
    return true;
  }

  if (code.toUpperCase() === "PRIMEIRA10" && (flow.firstTimeBonusApplied || !flow.isFirstTimeCustomer)) {
    await sendText({
      number: msg.phone,
      text: "Esse benefício é exclusivo para a primeira visita e não pode ser aplicado novamente nesta reserva.",
    });
    return true;
  }

  // Cliente precisa existir para validação de limite por cliente
  const clientId = await prisma.client.findUnique({ where: { phone: normalizePhone(msg.phone) } }).then((c) => c?.id);
  if (!clientId) {
    await sendText({ number: msg.phone, text: `Antes de usar cupom, confirme seu *nome* 😊` });
    return true;
  }

  const coupon = await findCouponByCode(code);
  if (!coupon || !coupon.active) {
    flow.couponError = 'invalid_or_inactive';
    flow.couponCode = code;
    await saveFlow(msg.phone, flow);
    await sendText({ number: msg.phone, text: `Cupom inválido ou inativo 😔` });
    return true;
  }

  // Validar regras (datas/limites/por cliente)
  const check = await canRedeem(coupon.id, clientId);
  if (!check.ok) {
    flow.couponError = check.reason;
    flow.couponCode = code;
    await saveFlow(msg.phone, flow);
    await sendText({ number: msg.phone, text: `Não foi possível aplicar o cupom: ${check.reason}.` });
    return true;
  }

  const applied = await applyCouponToFlowValue({ coupon, flow });
  flow.couponId = coupon.id;
  flow.couponCode = code;
  flow.couponDiscountApplied = applied.discountApplied;
  flow.quoteDiscountMode = applied.flow.quoteDiscountMode;
  flow.couponError = undefined;

  flow.quoteMin = applied.flow.quoteMin;
  flow.quoteMax = applied.flow.quoteMax;
  await saveFlow(msg.phone, flow);

  const formattedCouponCode = code.toUpperCase();
  const formattedDiscount = applied.discountApplied > 0 ? `*R$ ${applied.discountApplied.toFixed(2).replace(".", ",")}*` : "*sem valor fixo*";
  const finalValue = calculateFlowTotal(flow);
  const formattedFinalValue = `*R$ ${finalValue.toFixed(2).replace(".", ",")}*`;

  await sendText({
    number: msg.phone,
    text: couponApplied(formattedCouponCode, formattedDiscount, formattedFinalValue, wctx.prompts),
  });

  return true;
}

async function handlePayment(

  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  num: number | null,
  lower: string,
  wctx: WhatsAppCatalogContext
) {
  const { prompts } = wctx;
  const isNoPix = flow.stage === "ETAPA8_PAYMENT_NO_PIX";
  const max = isNoPix ? 2 : 3;
  const min = 1;
  const naturalNum = /\bpix\b/i.test(lower)
    ? isNoPix ? null : 1
    : /cart[aã]o|cr[eé]dito|d[eé]bito/i.test(lower)
      ? isNoPix ? 1 : 2
      : /dinheiro|esp[eé]cie/i.test(lower)
        ? isNoPix ? 2 : 3
        : null;
  const selectedNum = num ?? naturalNum;

  if (!selectedNum || selectedNum < min || selectedNum > max) {
    const optionsText = isNoPix
      ? `*1* Cartão (na loja)\n*2* Dinheiro (na loja)`
      : `*1* PIX\n*2* Cartão (na loja)\n*3* Dinheiro (na loja)`;
    await sendText({
      number: msg.phone,
      text: `Como prefere pagar? Pode escrever *PIX*, *cartão* ou *dinheiro*.\n\n${optionsText}`,
    });
    return;
  }

  const methodsNoPix = ["Cartão (na loja)", "Dinheiro (na loja)"];
  const methodsFull = ["PIX", "Cartão (na loja)", "Dinheiro (na loja)"];
  const methods = isNoPix ? methodsNoPix : methodsFull;
  flow.paymentMethod = methods[selectedNum - 1];

  if (flow.paymentMethod === "Cartão (na loja)" || flow.paymentMethod === "Dinheiro (na loja)") {
    flow.stage = "ETAPA14_REMINDER";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: reminderChoice(prompts),
    });
    return;
  }

  if (!isNoPix && selectedNum === 1 && !ctx.pixKey) {
    flow.paymentMethod = "PIX (no atendimento)";
    flow.pixPaymentType = "delivery";
    flow.stage = "ETAPA14_REMINDER";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: "Perfeito. O pagamento será feito por *PIX no dia do atendimento*.",
    });
    await sendText({ number: msg.phone, text: reminderChoice(prompts) });
    return;
  }

  // Se PIX for selecionado e tiver chave PIX configurada, mostrar escolha de pagamento
  if (!isNoPix && selectedNum === 1 && ctx.pixKey) {
    flow.stage = "ETAPA8_PIX_CHOICE";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: etapa8PixChoice(prompts),
    });
    return;
  }

  flow.stage = "ETAPA14_REMINDER";
  await saveFlow(msg.phone, flow);
  await sendText({
    number: msg.phone,
    text: reminderChoice(prompts),
  });
}

async function fetchLatestServiceStatus(phone: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const appointments = await prisma.appointment.findMany({
    where: {
      client: { phone: normalizePhone(phone) },
      status: { in: ["IN_PROGRESS", "COMPLETED", "CONFIRMED", "PENDING"] },
      OR: [{ date: { gte: sevenDaysAgo } }, { status: { in: ["IN_PROGRESS", "CONFIRMED", "PENDING"] } }],
    },
    orderBy: { updatedAt: "desc" },
    include: { service: true, client: true },
    take: 8,
  });

  const priority: Record<string, number> = { IN_PROGRESS: 4, COMPLETED: 3, CONFIRMED: 2, PENDING: 1 };
  return appointments.sort((a, b) => (priority[b.status] ?? 0) - (priority[a.status] ?? 0))[0] ?? null;
}

function serviceStatusCopy(status: string) {
  if (status === "IN_PROGRESS") {
    return {
      label: "Em execução",
      message: "Seu veículo está sendo cuidado pela nossa equipe. Avisaremos por aqui assim que o serviço for concluído.",
    };
  }
  if (status === "COMPLETED") {
    return {
      label: "Pronto para entrega",
      message: "O serviço foi concluído e o veículo está pronto. Se desejar, nossa equipe pode alinhar a retirada ou devolução por aqui.",
    };
  }
  if (status === "CONFIRMED") {
    return {
      label: "Agendamento confirmado",
      message: "Sua reserva está confirmada. Enviaremos um lembrete antes do horário combinado.",
    };
  }
  return {
    label: "Aguardando confirmação",
    message: "Recebemos sua solicitação e a equipe está finalizando a confirmação da reserva.",
  };
}

async function confirmFinal(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  includePix = false
) {
  // O simulador percorre a mesma jornada sem gravar agenda, financeiro ou cupons.
  let result: Awaited<ReturnType<typeof createAppointment>>;
  try {
    result = msg.testMode?.skipDb
      ? { conflict: false, appointment: { id: "simulation" } as any }
      : await createAppointment(flow, msg.phone);
  } catch (error) {
    console.error("[confirmFinal] Não foi possível criar a reserva:", error);
    const retryFlow: FlowState = { ...flow, stage: "ETAPA15_SUMMARY_CONFIRM" };
    await saveFlow(msg.phone, retryFlow);
    await sendText({
      number: msg.phone,
      text: "Não consegui concluir a reserva neste momento. Seus dados foram preservados. Tente confirmar novamente ou digite *9* para falar com um especialista.",
    });
    return;
  }

  if (result?.conflict) {
    const durationMin = flow.serviceDurationMin ?? 60;
    const fresh = await generateAvailableSlots(flow.dayDate ?? "", durationMin);
    flow.availableSlots = fresh;
    flow.startTime = undefined;
    flow.periodLabel = undefined;
    flow.stage = "ETAPA7_TIME";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: slotUnavailable(
        flow.dayLabel ?? flow.dayDate ?? "este dia",
        fresh.map((slot, index) => `*${index + 1}* — ${slot}`).join("\n"),
        wctx.prompts
      ),
    });
    return;
  }

  if (!result.appointment) {
    const retryFlow: FlowState = { ...flow, stage: "ETAPA15_SUMMARY_CONFIRM" };
    await saveFlow(msg.phone, retryFlow);
    await sendText({
      number: msg.phone,
      text: "Ainda não foi possível registrar a reserva. Revise o resumo e confirme novamente, ou digite *9* para atendimento humano.",
    });
    return;
  }

  const services = [

    flow.serviceLabel,
    flow.upsellAccepted ? flow.upsellLabel : null,
    flow.packageKey,
  ]
    .filter(Boolean)
    .join(" + ");

  const totalValue = calculateFlowTotal(flow);
  const name = clientDisplayName(flow, msg.pushName);
  const { prompts } = wctx;
  const confirmBody = etapa9Confirm(
    {
      name,
      vehicle: vehicleDisplayFromFlow(flow),
      services: services || "Serviço premium",
      day: flow.dayLabel ?? flow.dayDate ?? "—",
      time: flow.startTime ?? flow.periodLabel ?? "—",
      payment: flow.paymentMethod ?? "—",
      value: totalValue.toFixed(2).replace(".", ","),
      address: ctx.address || "nosso endereço",
      pixBlock: includePix ? etapa8PixBlock(ctx, prompts) : undefined,
    },
    prompts
  );

  const menuFlow: FlowState = {
    stage: "ETAPA2_MAIN_MENU",
    customerName: resolveValidCustomerName(flow.customerName) ?? undefined,
    welcomed: true,
    savedVehicle: [flow.vehicleModel, flow.vehicleYear].filter(Boolean).join(" ") || flow.vehicleRaw,
    savedVehiclePlate: flow.vehiclePlate,
    vehicleRaw: flow.vehicleRaw,
    vehicleModel: flow.vehicleModel,
    vehiclePlate: flow.vehiclePlate,
    vehicleYear: flow.vehicleYear,
    vehicleColor: flow.vehicleColor,
    vehicleCondition: flow.vehicleCondition,
    vehicleIsSuv: flow.vehicleIsSuv,
    vehicleConfirmed: true,
    awaitingPostConfirmationReturn: true,
  };

  await delay(180);
  await sendText({
    number: msg.phone,
    text: confirmBody,
  });

  await saveFlow(msg.phone, menuFlow, msg.testMode?.skipDb);
  if (!msg.testMode?.skipDb) {
    await prisma.whatsAppSession.updateMany({
      where: { phone: normalizePhone(msg.phone) },
      data: { pendingAppointmentId: null },
    });
  }
}

/** Primeira interação: sempre etapa 1 */
export async function startFlow(msg: IncomingMessage) {
  return flowDeliveryContext.run(msg.testMode, async () => {
    console.log("[WhatsApp Flow] 🚀 Iniciando flow de boas-vindas");
    const ctx = await loadContext();
    const wctx = await loadWhatsAppCatalog();
    const normalizedDigits = normalizePhone(msg.phone);
    const abWelcomeVariant: "A" | "B" = Number(normalizedDigits.slice(-1) || "0") % 2 === 0 ? "A" : "B";
    msg.initialWelcomePrefix = [
      `Olá! Você está falando com a *${ctx.businessName}* 🚗`,
      "",
      abWelcomeVariant === "A"
        ? "Sou a assistente virtual da equipe. Posso esclarecer dúvidas, recomendar o cuidado ideal e organizar seu agendamento."
        : "Vou cuidar do seu atendimento do começo ao fim: entendo o que seu veículo precisa, indico o serviço e encontro um bom horário para você.",
      "",
      ctx.address ? `📍 ${ctx.address}` : "📍 Consulte nosso endereço por aqui",
      `🕒 ${ctx.hours}`,
    ].join("\n");
    msg.initialWelcomeConsumed = false;
    const input = msg.text.trim();
    const combinedRequest = await extractCombinedInitialRequest(input, wctx, msg.pushName);
    if (combinedRequest) {
      await ensureClient(msg.phone, combinedRequest.customerName!, msg.testMode?.skipDb);
      const item = combinedRequest.serviceKey ? wctx.catalog[combinedRequest.serviceKey] : null;
      const dbService = msg.testMode?.skipDb || !item
        ? null
        : await resolveDbService(combinedRequest.serviceKey, item.dbMatch);
      combinedRequest.dbServiceId = combinedRequest.serviceKey
        ? wctx.dbServiceIdByKey[combinedRequest.serviceKey] ?? dbService?.id
        : undefined;
      await saveFlow(msg.phone, combinedRequest, !!msg.testMode);
      msg.testMode?.onFlowStateChange?.(combinedRequest);
      await sendTextWrapper(msg, initialRequestSummaryText(combinedRequest, wctx));
      return;
    }
    const returningClient = msg.testMode?.skipDb
      ? null
      : await prisma.client.findUnique({
          where: { phone: normalizePhone(msg.phone) },
          select: { name: true, vehicleModel: true, vehiclePlate: true },
        }).catch(() => null);
    const detectedServiceKey = detectServiceKey(input);
    const serviceKey = detectedServiceKey && detectedServiceKey !== "indeciso"
      ? detectedServiceKey
      : undefined;
    const questionByRule = looksLikeQuestion(input);
    const analysis = questionByRule
      ? null
      : await analyzeWhatsAppMessage({
          text: input,
          stage: "ETAPA1_AWAITING_NAME",
          pushName: msg.pushName,
          ctx,
        });
    const availabilityRequest = isAvailabilityRequest(input);
    const availabilityDay = availabilityRequest ? parseDayInput(input, null) : null;
    const initialDoubt =
      !availabilityRequest && (questionByRule || analysis?.intent === "doubt");
    const understoodSchedule =
      availabilityRequest ||
      (!initialDoubt && (
        analysis?.intent === "schedule" ||
        analysis?.intent === "service" ||
        wantsToSchedule(input, onlyNumber(input)) ||
        Boolean(serviceKey)
      ));
    const returningName = resolveValidCustomerName(returningClient?.name);
    const savedVehicle = returningClient?.vehicleModel || returningClient?.vehiclePlate || null;
    const savedVehiclePlate = returningClient?.vehiclePlate || null;
    const profileName = returningName ?? profileDisplayName(msg.pushName);

    if (initialDoubt) {
      const initialState: FlowState = profileName
        ? {
            stage: "ETAPA2_MAIN_MENU",
            customerName: profileName,
            welcomed: true,
            pendingInitialIntent: "doubt",
            pendingServiceKey: serviceKey,
            isReturningClient: Boolean(returningName),
            savedVehicle,
            savedVehiclePlate,
            abWelcomeVariant,
          }
        : {
            stage: "ETAPA1_AWAITING_NAME",
            welcomed: true,
            pendingInitialIntent: "doubt",
            pendingServiceKey: serviceKey,
            abWelcomeVariant,
          };

      if (profileName) {
        await ensureClient(msg.phone, profileName, msg.testMode?.skipDb);
      }
      await saveFlow(msg.phone, initialState, !!msg.testMode);
      msg.testMode?.onFlowStateChange?.(initialState);

      const answer = await buildCustomerDoubtAnswer(input, initialState, ctx, wctx, analysis?.reply);
      await sendTextWrapper(msg, answer, { voiceReply: true });
      await sendTextWrapper(
        msg,
        profileName
          ? doubtResumePrompt(initialState)
          : "Para personalizar o atendimento, como posso te chamar? 😊\n_Envie somente seu primeiro nome._"
      );
      return;
    }

    if (understoodSchedule && profileName) {
      await ensureClient(msg.phone, profileName, msg.testMode?.skipDb);
      const namedState: FlowState = {
        stage: "ETAPA2_MAIN_MENU",
        customerName: profileName,
        welcomed: true,
        isReturningClient: Boolean(returningName),
        savedVehicle,
        savedVehiclePlate,
        pendingInitialIntent: availabilityRequest ? "schedule" : undefined,
        dayDate: availabilityDay?.dayDate,
        dayLabel: availabilityDay?.dayLabel,
        requestedTimePreference: detectRequestedTimePreference(input),
        serviceRequestContext: input.slice(0, 500),
        abWelcomeVariant,
      };

      if (availabilityRequest && !serviceKey) {
        await showAvailabilityServiceSelection(msg, namedState, wctx);
        return;
      }

      await saveFlow(msg.phone, namedState, !!msg.testMode);
      msg.testMode?.onFlowStateChange?.(namedState);
      if (serviceKey) {
        if (availabilityRequest && looksLikeQuestion(input)) {
          const requestedDate = namedState.dayLabel ?? namedState.dayDate ?? "a data desejada";
          await sendTextWrapper(
            msg,
            `Claro. Vou consultar a agenda para ${requestedDate}, considerando o tempo de ${wctx.catalog[serviceKey]?.label ?? "serviço escolhido"}.`,
            { voiceReply: true }
          );
        }
        await activateService(msg, { ...namedState, serviceRequestContext: input.slice(0, 500) }, serviceKey, wctx);
        if (availabilityRequest) {
          await sendCalendarWithImageAndList({ number: msg.phone, prompts: wctx.prompts });
        }
      } else {
        await sendTextWrapper(msg, flowMsg(wctx).mainMenu(namedState, msg.pushName));
      }
      return;
    }

    if (returningName) {
      const returningState: FlowState = {
        stage: "ETAPA2_MAIN_MENU",
        customerName: returningName,
        welcomed: true,
        isReturningClient: true,
        savedVehicle,
        savedVehiclePlate,
        awaitingReturningVehicleChoice: Boolean(savedVehicle),
      };
      await saveFlow(msg.phone, returningState, !!msg.testMode);
      msg.testMode?.onFlowStateChange?.(returningState);
      await sendTextWrapper(
        msg,
        savedVehicle
          ? `Olá, *${returningName}*! Que bom ter você de volta 😊\n\nEste atendimento será para o mesmo veículo, *${savedVehicle}${savedVehiclePlate ? ` · ${savedVehiclePlate}` : ""}*?\n\n*1* ✅ Sim, o mesmo veículo\n*2* 🚗 Não, quero informar outro\n\n_Você também pode responder com suas palavras._`
          : flowMsg(wctx).mainMenu(returningState, msg.pushName),
        { includesWelcome: true }
      );
      return;
    }

    console.log("[WhatsApp Flow] 📤 Enviando mensagem de boas-vindas");
    const availabilityTarget = availabilityDay?.dayLabel ?? availabilityDay?.dayDate;
    if (availabilityRequest && looksLikeQuestion(input)) {
      await sendTextWrapper(
        msg,
        "Claro. Posso verificar a agenda para você. Para mostrar horários reais, preciso primeiro do serviço desejado.",
        { voiceReply: true }
      );
    }
    await sendTextWrapper(
      msg,
      availabilityRequest
        ? [
            availabilityTarget
              ? `Posso verificar a agenda para *${availabilityTarget}*.`
              : "Posso verificar a agenda para você.",
            "",
            serviceKey
              ? `Já identifiquei o serviço *${wctx.catalog[serviceKey]?.label}*.`
              : "Como cada serviço tem uma duração diferente, envie em uma única mensagem seu *primeiro nome* e o *serviço desejado*.",
            "",
            serviceKey
              ? "Para continuar, como posso te chamar?"
              : "Exemplo: _Gustavo, lavagem simples._",
          ].join("\n")
        : understoodSchedule
        ? initialScheduleNameRequest(serviceKey ? wctx.catalog[serviceKey]?.label : null, wctx.prompts)
        : etapa1Welcome(ctx, wctx.prompts),
      { includesWelcome: !availabilityRequest && !understoodSchedule, voiceReply: false }
    );
    console.log("[WhatsApp Flow] 💾 Salvando estado com welcomed=true");
    const initialState: FlowState = {
      stage: "ETAPA1_AWAITING_NAME",
      welcomed: true,
      pendingInitialIntent: understoodSchedule ? (serviceKey ? "service" : "schedule") : undefined,
      pendingServiceKey: serviceKey,
      serviceRequestContext: understoodSchedule ? input.slice(0, 500) : undefined,
      dayDate: availabilityDay?.dayDate,
      dayLabel: availabilityDay?.dayLabel,
      requestedTimePreference: detectRequestedTimePreference(input),
      abWelcomeVariant,
    };
    await saveFlow(msg.phone, initialState, !!msg.testMode);
    msg.testMode?.onFlowStateChange?.(initialState);
    if (availabilityRequest) {
      await sendCalendarWithImageAndList({ number: msg.phone, prompts: wctx.prompts });
    }
    console.log("[WhatsApp Flow] ✅ Flow de boas-vindas concluído");
  });
}

export async function goToMainMenu(phone: string, customerName: string) {
  const wctx = await loadWhatsAppCatalog();
  const validName = resolveValidCustomerName(customerName);
  const flow: FlowState = {
    stage: "ETAPA2_MAIN_MENU",
    welcomed: true,
    customerName: validName ?? undefined,
  };
  await saveFlow(phone, flow);
  await sendText({ number: phone, text: flowMsg(wctx).mainMenu(flow) });
}
