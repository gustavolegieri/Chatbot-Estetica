import {
  buildRepeatOffer,
  formatRepeatOffer,
  slotLabel,
  parseRepeatChoice,
  type RepeatOffer,
} from "./whatsapp-repeat-offer";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { renderPrompt } from "./bot-prompts";
import {
  sendText as sendTextRaw,
  sendMedia as sendMediaRaw,
  sendList as sendListRaw,
  sendButtons,
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
  generateAvailableSlotsRange,
  overlapsExisting,
  parseTimeInput,
  parseTimeSelection,
  timeToMinutes,
} from "./appointments";
import { normalizePhone } from "./utils";
import { providerSupportsButtons } from "./whatsapp-provider";
import {
  MAX_LIST_ROWS,
  parseNumberedOptions,
  planInteractiveDelivery,
  renderOptionLines,
} from "./whatsapp-interactive";
import { customerDayDisplay } from "./whatsapp-flow-types";
import {
  BRAND_DEFAULT,
  MAIN_MENU_CATEGORIES,
  UNDECIDED_TO_KEY,
  loadWhatsAppCatalog,
  buildMainMenu,
  catalogMenuNumber,
  categoryFromMenuNumber,
  mainMenuEntries,
  subMenuForCategoryCtx,
  getUpsellForKey,
  type WhatsAppCatalogContext,
} from "./whatsapp-service-catalog";
import { CATALOG, CATEGORIES } from "./whatsapp-catalog";
import {
  cancelAppointmentFromBot,
  detectAppointmentChangeIntent,
  fetchNextAppointment,
  stageAllowsAppointmentChange,
} from "./whatsapp-appointment-change";
import { resolveValidCustomerName } from "./customer-name";
import { getCachedWorkingDays, getRuntimeSettings } from "./settings-runtime";
import { sendWelcomeCover } from "./whatsapp-welcome";
import {
  generateCatalogCard,
  generateExtrasCard,
  generateProposalCard,
  generateServiceCard,
  generateSlotsCard,
  generateTicketCard,
  serviceCardFromDetail,
} from "./whatsapp-cards";
import { eventoNaAgenda, proximaManutencao, rotaNoMapa } from "./whatsapp-links";
import { reserva as copyReserva } from "./whatsapp-copy";
import { humanizarDuracao } from "./whatsapp-service-catalog";
import { requestHumanHandoff, wantsHumanHandoff } from "./whatsapp-handoff";
import {
  etapa1Welcome,
  etapa2MainMenu,
  etapa4Vehicle,
  etapa4VehicleConfirmation,
  etapa5Quote,
  etapa6Upsell,
  etapa7Day,
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
  greetingByTime,
  isAvailabilityRequest,
  isConversationOpener,
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
  isValidVehiclePlate,
  normalizeVehiclePlate,
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
  buildSummaryConfirmResponses,
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

const STRUCTURED_INPUT_STAGES = new Set<FlowState["stage"]>([
  "ETAPA4_VEHICLE",
  "ETAPA4_VEHICLE_CONFIRM",
  "ETAPA7_DAY",
  "ETAPA7_TIME",
  "ETAPA7_PERIOD",
  "ETAPA7_CUSTOM_DAY",
  "ETAPA9_COUPON",
  "ETAPA9_LOYALTY",
  "ETAPA9_REMINDER",
  "ETAPA10_BUDGET",
  "ETAPA10_LOGISTICS",
  "ETAPA8_PAYMENT",
  "ETAPA8_PAYMENT_NO_PIX",
  "ETAPA8_PAYMENT_CARD_TYPE",
  "ETAPA8_PIX_CHOICE",
  "ETAPA8_RECEIPT_UPLOAD",
  "ETAPA14_REMINDER",
  "ETAPA15_SUMMARY_CONFIRM",
  "ETAPA16_CONFIRMATION",
]);

function shouldAnalyzeFreeTextIntent(stage: FlowState["stage"], text: string): boolean {
  if (STRUCTURED_INPUT_STAGES.has(stage)) return false;
  const value = text.trim();
  return !(
    /^\d{1,2}$/.test(value) ||
    /^\d{1,2}:\d{2}$/.test(value) ||
    /^\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?$/.test(value)
  );
}

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

/**
 * Entrega uma resposta do fluxo que pode trazer imagem.
 *
 * A legenda de uma mídia não aceita lista nem botão. Quando a mensagem tem
 * imagem *e* opções — o caso do resumo com o cartão do agendamento —, o resumo
 * vai na legenda e as opções seguem em uma mensagem própria, que aí sim chega
 * tocável. Sem provedor interativo nada muda: legenda e opções continuam juntas.
 */
async function sendFlowResponse(
  msg: IncomingMessage,
  resposta: { text?: string; mediaUrl?: string; mediaType?: string; voiceReply?: boolean }
) {
  if (!resposta.mediaUrl) {
    return sendText({ number: msg.phone, text: resposta.text ?? "", voiceReply: resposta.voiceReply });
  }

  const mediaType = (resposta.mediaType as "image" | "video") ?? "image";
  const plano = resposta.text ? planInteractiveDelivery(resposta.text) : { kind: "text" as const };

  if (plano.kind === "text") {
    return sendMedia({
      number: msg.phone,
      mediaUrl: resposta.mediaUrl,
      mediaType,
      caption: resposta.text || undefined,
    });
  }

  const { body, options } = parseNumberedOptions(resposta.text ?? "");
  const entrega = await sendMedia({
    number: msg.phone,
    mediaUrl: resposta.mediaUrl,
    mediaType,
    caption: body,
  });
  await sendText({
    number: msg.phone,
    text: `Como deseja seguir?\n\n${renderOptionLines(options)}`,
    voiceReply: false,
  });
  return entrega;
}

/** Lista de opções. No simulador vira texto numerado, como o cliente veria. */
async function sendList(params: Parameters<typeof sendListRaw>[0]) {
  const callback = flowDeliveryContext.getStore()?.sendTextCallback;
  if (callback) {
    const linhas: string[] = [`*${params.title}*`, params.description];
    let posicao = 0;
    for (const section of params.sections) {
      for (const row of section.rows) {
        posicao++;
        linhas.push(`*${posicao}* — ${row.title}${row.description ? ` — ${row.description}` : ""}`);
      }
    }
    await callback(linhas.filter(Boolean).join("\n"));
    return { simulated: true };
  }
  return sendListRaw(params);
}

async function sendCalendarWithImageAndList(params: { number: string; prompts?: unknown; caption?: string }) {
  const callback = flowDeliveryContext.getStore()?.sendTextCallback;
  if (!callback) {
    return sendCalendarWithImageAndListRaw(params);
  }

  try {
    const imageUrl = await generateCalendarImageOnly();
    await callback(`[MÍDIA: image|${imageUrl}] ${params.caption?.trim() || generateCalendarLegend()}`);
  } catch (error) {
    console.warn("[WhatsApp Flow] Não foi possível gerar calendário para o simulador:", error);
    await callback(params.caption?.trim() || generateCalendarLegend());
  }

  // A orientação já acompanha a imagem. O simulador não repete a mesma
  // mensagem que, no WhatsApp real, aparece junto ao botão "Ver dias".
  return { simulated: true };
}

/**
 * Wrapper para sendText que suporta modo de teste
 */
/**
 * Apresentação da marca: cartão com o texto na legenda.
 *
 * É a primeira coisa que o cliente vê, e antes era um parágrafo de oito linhas
 * com endereço e horário no meio. O simulador do painel não renderiza imagem,
 * então lá continua o texto.
 */
async function enviarAberturaDaMarca(msg: IncomingMessage, texto: string) {
  if (msg.testMode) {
    await sendText({ number: msg.phone, text: texto, voiceReply: false });
    return;
  }
  await sendWelcomeCover(msg.phone, texto, "ETAPA1_AWAITING_NAME");
}

async function sendTextWrapper(
  msg: IncomingMessage,
  text: string,
  options?: { voiceReply?: boolean; includesWelcome?: boolean; welcomeCover?: boolean }
) {
  await flowDeliveryContext.run(msg.testMode, async () => {
    let outboundText = text;
    if (msg.initialWelcomePrefix && !msg.initialWelcomeConsumed) {
      msg.initialWelcomeConsumed = true;
      if (!options?.includesWelcome) {
        // A apresentação nunca deve chegar colada ao menu, serviço ou dúvida.
        // Mantemos uma mensagem curta e independente antes de continuar.
        await enviarAberturaDaMarca(msg, msg.initialWelcomePrefix);
        if (!msg.testMode?.sendTextCallback) await delay(180);
      }
    }
    // O simulador do painel não renderiza imagem; lá a capa continua como texto.
    if (options?.welcomeCover && !msg.testMode) {
      await sendWelcomeCover(msg.phone, outboundText, "ETAPA1_AWAITING_NAME");
      return;
    }
    await sendText({ number: msg.phone, text: outboundText, voiceReply: options?.voiceReply });
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

  const assertDelivered = (delivery: unknown) => {
    if (!delivery || typeof delivery !== "object") return;
    const status = delivery as { error?: boolean; blocked?: boolean; queued?: boolean; message?: string };
    if (status.error || status.blocked || status.queued) {
      throw new Error(status.message || "A resposta do fluxo não foi entregue imediatamente");
    }
  };

  // Enviar antes de avançar a etapa. Assim o sistema nunca espera uma resposta
  // para uma pergunta que o cliente ainda não recebeu.
  for (let index = 0; index < result.responses.length; index++) {
    const response = result.responses[index];
    if (response.mediaUrl && response.mediaType) {
      if (msg.testMode?.sendTextCallback) {
        // Em modo de teste, retorna texto + mídia para exibição no painel
        await msg.testMode.sendTextCallback(`[MÍDIA: ${response.mediaType}|${response.mediaUrl}] ${response.text || ""}`);
      } else {
        assertDelivered(await sendFlowResponse(msg, response));
      }
      continue;
    }

    if (response.text) {
      const textBatch = [response.text];
      while (
        index + 1 < result.responses.length &&
        result.responses[index + 1].text &&
        !result.responses[index + 1].mediaUrl
      ) {
        textBatch.push(result.responses[index + 1].text);
        index++;
      }
      const combinedText = textBatch.join("\n\n");
      if (msg.testMode?.sendTextCallback) {
        await msg.testMode.sendTextCallback(combinedText, { voiceReply: response.voiceReply });
      } else {
        const delivery = await sendText({
          number: msg.phone,
          text: combinedText,
          voiceReply: response.voiceReply,
        });
        assertDelivered(delivery);
      }
    }
  }

  // A criação final é atômica: não gravamos uma etapa intermediária de
  // confirmação antes de a reserva realmente existir.
  const deferFinalConfirmationPersistence =
    flow.stage === "ETAPA15_SUMMARY_CONFIRM" &&
    result.nextState.stage === "ETAPA16_CONFIRMATION";
  if (!deferFinalConfirmationPersistence) {
    await saveFlow(msg.phone, result.nextState, msg.testMode?.skipDb);
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
        buildMainMenu(wctx.categories, prompts, wctx.catalog),
        prompts
      ),
    subMenu: (n: number) => subMenuForCategoryCtx(n, wctx),
    detail: (key: string, includeActionMenu = true) => {
      const item = catalog[key];
      if (!item) return "";
      return serviceDetail(item, prompts, wctx.servicesByKey[key]?.whatsappDetail, includeActionMenu);
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

/**
 * Serviços cujo preço/execução dependem do estado da pintura. Só neles faz
 * sentido exigir cor e conservação antes do orçamento.
 */
const SERVICOS_SENSIVEIS_AO_ESTADO =
  /polimento|vitrific|cer[âa]mic|coating|revitaliza|descontamina|premium|prote[çc][ãa]o|cristaliza/i;

function servicoDependeDoEstado(flow: FlowState): boolean {
  const referencia = `${flow.serviceKey ?? ""} ${flow.serviceLabel ?? ""}`.trim();
  return referencia ? SERVICOS_SENSIVEIS_AO_ESTADO.test(referencia) : false;
}

/**
 * Dados de veículo realmente necessários para fechar o agendamento.
 *
 * Antes o fluxo exigia modelo + ano + placa + cor + estado para qualquer
 * serviço — cinco campos para uma lavagem de R$ 55, o que fazia o cliente
 * desistir na coleta. Agora:
 *  - modelo é sempre necessário (define porte e preço);
 *  - cor e estado só entram quando o serviço depende da pintura;
 *  - a placa saiu da coleta e é pedida depois da confirmação, quando o cliente
 *    já comprou (ver `awaitingPlateAfterBooking`). Ela continua obrigatória
 *    para o reconhecimento no portão, só deixou de bloquear a venda.
 */
export function requiredVehicleFields(flow: FlowState): VehicleField[] {
  const campos: VehicleField[] = ["model"];
  if (servicoDependeDoEstado(flow)) campos.push("color", "condition");
  return campos;
}

function hasVehicleInFlow(flow: FlowState) {
  const faltando = missingVehicleFields(flow);
  if (faltando.length === 0) return true;
  // Um texto livre já reconhecido como veículo cobre o modelo.
  if (faltando.length === 1 && faltando[0] === "model") {
    return Boolean(flow.vehicleRaw && isValidVehicle(flow.vehicleRaw));
  }
  return false;
}

/**
 * Tenta abrir a conversa com a oferta de repetição. Devolve `true` quando a
 * oferta foi enviada — nesse caso o chamador não deve seguir para o menu.
 */
async function offerRepeatIfPossible(msg: IncomingMessage, flow: FlowState): Promise<boolean> {
  if (msg.testMode?.skipDb) return false;
  try {
    const oferta = await buildRepeatOffer(msg.phone);
    if (!oferta) return false;
    const nome = clientDisplayName(flow, msg.pushName);
    await saveFlow(msg.phone, { ...flow, repeatOffer: oferta, stage: "ETAPA2_MAIN_MENU" });

    // Com provedor que suporta botão, os horários viram toque em vez de digitar
    // um número. É o ponto de maior atrito do fluxo rápido.
    if (providerSupportsButtons() && oferta.slots.length) {
      const botoes = oferta.slots.slice(0, 2).map((slot, i) => ({
        id: String(i + 1),
        displayText: `${slot.label} ${slot.time}`.slice(0, 20),
      }));
      botoes.push({ id: "5", displayText: "Outro horário" });
      await sendButtons({
        number: msg.phone,
        title: `Oi, ${nome}! 👋`,
        description: `Da última vez foi *${oferta.serviceName}* no *${oferta.vehicleLabel}*.\nQuer repetir? R$ ${oferta.servicePrice.toFixed(2).replace(".", ",")}`,
        footer: "Toque em um horário para reservar",
        buttons: botoes,
      });
      return true;
    }

    await sendText({ number: msg.phone, text: formatRepeatOffer(oferta, nome) });
    return true;
  } catch (error) {
    console.error("[WhatsApp Flow] Oferta de repetição indisponível; seguindo pelo menu.", error);
    return false;
  }
}

/**
 * Depois de reconhecer o veículo, segue direto para o orçamento.
 *
 * A tela "confirma que é um Civic 2020? *1* sim *2* não" custava um turno para
 * validar um dado que o próprio orçamento e o resumo final já mostram — e que o
 * cliente pode corrigir escrevendo a qualquer momento. Ela só continua
 * aparecendo quando ainda falta algum dado obrigatório do veículo.
 */
async function advanceAfterVehicle(
  msg: IncomingMessage,
  next: FlowState,
  wctx: WhatsAppCatalogContext
) {
  if (!hasVehicleInFlow(next)) {
    await saveFlow(msg.phone, next);
    await sendText({ number: msg.phone, text: vehicleMissingCopy(next, wctx.prompts) });
    return;
  }
  const confirmado: FlowState = { ...next, vehicleConfirmed: true, vehicleCollectStep: undefined };
  await saveFlow(msg.phone, confirmado);
  await sendQuote(msg, confirmado, wctx);
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
  const preenchido: Record<VehicleField, boolean> = {
    model: Boolean(flow.vehicleModel),
    year: Boolean(flow.vehicleYear),
    plate: Boolean(flow.vehiclePlate),
    color: Boolean(flow.vehicleColor),
    condition: Boolean(flow.vehicleCondition),
  };
  return requiredVehicleFields(flow).filter((campo) => !preenchido[campo]);
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
    // `whatsappShort` guarda a descrição do serviço ("Ducha, secagem, limpeza
    // interna..."), não um nome curto: usada aqui, a lista de agendamentos
    // mostrava um parágrafo no lugar de "Lavagem Completa".
    const serviceLabel = appointment.service.name;
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

    const status = serviceStatusCopy(appointment.operationalStatus);
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

/**
 * Pede os dados do veículo. `prefixo` permite juntar o detalhe do serviço à
 * pergunta na mesma mensagem — o fluxo mantém uma pergunta por resposta do
 * cliente mesmo tendo perdido a etapa intermediária de "quer agendar?".
 */
async function goToVehicleStep(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  prefixo?: string
) {
  const comPrefixo = (texto: string) => (prefixo ? `${prefixo}\n\n${texto}` : texto);
  if (flow.savedVehicle && !hasVehicleInFlow(flow)) {
    const saved = parseVehicleMessage(flow.savedVehicle);
    const next: FlowState = {
      ...flow,
      stage: "ETAPA4_VEHICLE",
      vehicleModel: saved.model || flow.savedVehicle,
      vehiclePlate: flow.savedVehiclePlate || saved.plate || undefined,
      vehicleRaw: saved.summary || flow.savedVehicle,
      vehicleYear: saved.year || undefined,
      vehicleColor: flow.vehicleColor,
      vehicleCondition: flow.vehicleCondition,
      vehicleIsSuv: saved.isSuv,
    };

    // O cliente que retorna já respondeu "é o mesmo veículo?" na abertura da
    // conversa. Perguntar de novo aqui repetia a mesma pergunta sete passos
    // depois. Quando a escolha já foi feita, seguimos direto.
    if (flow.vehicleConfirmed) {
      next.vehicleCollectStep = hasVehicleInFlow(next) ? undefined : "details";
      await saveFlow(msg.phone, next);
      if (hasVehicleInFlow(next)) {
        if (prefixo) await sendText({ number: msg.phone, text: prefixo });
        await sendQuote(msg, next, wctx);
      } else {
        await sendText({ number: msg.phone, text: comPrefixo(vehicleMissingCopy(next, wctx.prompts)) });
      }
      return;
    }

    next.vehicleCollectStep = "details";
    next.awaitingSavedVehicleChoice = true;
    await saveFlow(msg.phone, next);
    await sendText({
      number: msg.phone,
      text: comPrefixo(`Veículo salvo encontrado: *${flow.savedVehicle}${flow.savedVehiclePlate ? ` · ${flow.savedVehiclePlate}` : ""}*.

Deseja usar esse veículo novamente?
*1* — Sim
*2* — Não, informar outro veículo`),
    });
    return;
  }

  const next = beginVehicleCollection(flow);
  await saveFlow(msg.phone, next);
  const delivery = await sendText({
    number: msg.phone,
    text: comPrefixo(
      vehicleKnownLabel(next) === "nenhum dado confirmado ainda"
        ? etapa4Vehicle(false, wctx.prompts)
        : vehicleMissingCopy(next, wctx.prompts)
    ),
  });
  if ((delivery as any)?.error || (delivery as any)?.blocked || (delivery as any)?.queued) {
    throw new Error("Não foi possível pedir os dados do veículo imediatamente");
  }
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
    return { min: 0, max: 0, time: humanizarDuracao(item.time), label: item.label };
  }
  // "90 min" na mensagem do orcamento vira "1h30", igual ao resto do fluxo.
  return { min, max, time: humanizarDuracao(item.time), label: item.label };
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
  // Escolher o serviço na lista já é a decisão de agendar. O menu "1 agendar /
  // 2 outro serviço / 3 dúvida" custava um turno inteiro para repetir uma
  // intenção que o cliente acabou de manifestar; agora só os pacotes, que
  // precisam de comparação, mantêm o menu de ação.
  const ehPacote = serviceKey === "pacotes";
  const activeFlow: FlowState = {
    ...flow,
    serviceKey,
    serviceLabel: item.label,
    dbServiceId: dbId,
    stage: ehPacote ? "ETAPA3_PACKAGE_ACTION" : "ETAPA3_SERVICE_ACTION",
  };
  const requestContext = (flow.serviceRequestContext ?? "").toLowerCase();
  const contextualIntro = /terra|barro|poeira|muito sujo/.test(requestContext) && /lavagem/.test(serviceKey)
    ? "Pelo que você contou sobre a sujeira do veículo, esta opção é um bom ponto de partida. Se houver resíduos muito aderidos, confirmamos o nível ideal após uma avaliação rápida."
    : /mancha|odor|cheiro/.test(requestContext) && /higienizacao/.test(serviceKey)
      ? "Como você mencionou manchas ou odores, esta higienização é a opção mais alinhada ao seu caso. A avaliação identifica o tratamento adequado para o revestimento."
      : /risco|opac|sem brilho/.test(requestContext) && /polimento|pintura/.test(serviceKey)
        ? "Pelo relato sobre riscos ou perda de brilho, este serviço é o mais indicado para começarmos a avaliação da pintura."
        : null;
  const detailText = `${contextualIntro ? `${contextualIntro}\n\n` : ""}${flowMsg(wctx).detail(serviceKey, ehPacote)}`;

  const detailWithWelcome = detailText;
  if (msg.initialWelcomePrefix && !msg.initialWelcomeConsumed) {
    msg.initialWelcomeConsumed = true;
    await sendText({ number: msg.phone, text: msg.initialWelcomePrefix, voiceReply: false });
    if (!msg.testMode?.sendTextCallback) await delay(180);
  }

  // Imagem do serviço, quando houver: o detalhe vira a legenda para não
  // separar uma etapa lógica em duas mensagens.
  let media: { path?: string; mimeType?: string } | null = null;
  if (dbId) {
    try {
      // Nem todo schema possui serviceMedia; tratar de forma compatível.
      media = await (prisma as any).serviceMedia?.findFirst({
        where: { serviceId: dbId },
        orderBy: { createdAt: "asc" },
      });
    } catch (err) {
      console.error("[Midia] Erro ao buscar mídia do serviço:", err);
      media = null;
    }
  }

  const assertDelivery = (delivery: unknown) => {
    if ((delivery as any)?.error || (delivery as any)?.blocked || (delivery as any)?.queued) {
      throw new Error("Não foi possível entregar os detalhes do serviço imediatamente");
    }
  };

  await saveFlow(msg.phone, activeFlow);

  // Pacote: o detalhe termina no menu de comparação e a conversa para aqui.
  if (ehPacote) {
    assertDelivery(await entregarDetalhe(msg, detailWithWelcome, media));
    return;
  }

  // Serviço avulso: escolher o serviço já é a decisão de agendar, então o
  // detalhe e o pedido do veículo saem juntos — uma pergunta por resposta.
  if (hasVehicleInFlow(activeFlow)) {
    assertDelivery(await entregarDetalhe(msg, detailWithWelcome, media));
    await sendQuote(msg, activeFlow, wctx);
    return;
  }

  if (media?.path) {
    assertDelivery(await entregarDetalhe(msg, detailWithWelcome, media));
    await goToVehicleStep(msg, activeFlow, wctx);
    return;
  }

  // Sem mídia cadastrada, o próprio detalhe vira cartão: preço, duração e o que
  // inclui saem do parágrafo e entram na imagem, e o texto fica só com o passo
  // seguinte. O simulador do painel continua em texto puro.
  if (!msg.testMode) {
    const cartao = await generateServiceCard(
      serviceCardFromDetail(detailText, {
        name: item.label,
        price: item.hatchMin > 0 ? `R$ ${item.hatchMin}` : "Sob avaliação",
        duration: humanizarDuracao(item.time),
      })
    );
    if (cartao) {
      assertDelivery(
        await sendMedia({
          number: msg.phone,
          mediaUrl: cartao,
          caption: `*${item.label}* — ${item.hatchMin > 0 ? `R$ ${item.hatchMin}` : "valor sob avaliação"} · ${humanizarDuracao(item.time)}`,
        })
      );
      await goToVehicleStep(msg, activeFlow, wctx);
      return;
    }
  }

  await goToVehicleStep(msg, activeFlow, wctx, detailWithWelcome);
}

/** Envia o detalhe do serviço com a mídia cadastrada, se existir. */
async function entregarDetalhe(
  msg: IncomingMessage,
  texto: string,
  media: { path?: string; mimeType?: string } | null
) {
  if (!media?.path) return sendText({ number: msg.phone, text: texto });
  const mediaType = media.mimeType?.startsWith("video/")
    ? "video"
    : media.mimeType?.startsWith("image/")
      ? "image"
      : "document";
  try {
    return await sendMedia({ number: msg.phone, mediaUrl: media.path, caption: texto, mediaType });
  } catch (err) {
    console.error("[Midia] Erro ao enviar mídia do serviço:", err);
    return sendText({ number: msg.phone, text: texto });
  }
}

function dateLabel(date: Date, includeYear = false) {
  return format(date, includeYear ? "dd/MM/yyyy (EEEE)" : "dd/MM (EEEE)", { locale: ptBR });
}

function validBusinessDay(date: Date) {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (date < dayStart) return false;
  // Os dias de funcionamento vêm do painel. Antes o domingo estava fechado no
  // código: uma loja que abrisse aos domingos teria o dia oferecido pela agenda
  // e recusado aqui, e quem fechasse às segundas continuaria recebendo pedidos.
  const diasDeTrabalho = getCachedWorkingDays();
  if (diasDeTrabalho) return diasDeTrabalho.includes(date.getDay());
  return date.getDay() !== 0;
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
  const date = customerDayDisplay(flow);
  return [
    `Claro, *${name}*. ${date ? `Considerei *${date}*.` : "Vamos encontrar a melhor data para você."}`,
    "",
    "Para consultar os horários reais, primeiro preciso saber qual serviço você deseja — a duração muda conforme o cuidado escolhido.",
    "",
    buildMainMenu(wctx.categories, wctx.prompts, wctx.catalog),
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
    "📋 *Seu orçamento*",
    `• Serviço: ${flow.serviceLabel ?? "Serviço premium"} — *R$ ${serviceValue.toFixed(2).replace(".", ",")}*`,
  ];

  if (complementValue > 0) {
    lines.push(`• Proteção: *R$ ${complementValue.toFixed(2).replace(".", ",")}*`);
  }

  if (pickupValue > 0) {
    lines.push(`• Leva e traz: *R$ ${pickupValue.toFixed(2).replace(".", ",")}*`);
  }

  if (couponValue > 0) {
    lines.push(`• Cupom: *- R$ ${couponValue.toFixed(2).replace(".", ",")}*`);
  }

  if (firstTimeBonus > 0) {
    lines.push(`• Bônus de primeira visita: *- R$ ${firstTimeBonus.toFixed(2).replace(".", ",")}*`);
  }

  lines.push(`• *Total: R$ ${totalValue.toFixed(2).replace(".", ",")}*`);
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

async function loadContext(): Promise<FlowContext> {
  let s: Awaited<ReturnType<typeof prisma.settings.findUnique>> = null;
  try {
    s = await getRuntimeSettings();
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
    // `businessAddress` costuma ficar vazio; o endereço real do local mora em
    // `storeAddress` (usado pelo cálculo de leva-e-traz). Sem este fallback o
    // bot respondia "Consulte nosso endereço" mesmo tendo o endereço cadastrado.
    address: s?.businessAddress?.trim() || s?.storeAddress?.trim() || "",
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

function catalogDurationMinutes(serviceKey: string) {
  const value = CATALOG[serviceKey]?.time ?? "";
  const minutes = value.match(/(\d+)\s*min/i)?.[1];
  if (minutes) return Math.max(15, Number(minutes));
  const hours = value.match(/(\d+)\s*h/i)?.[1];
  if (hours) return Math.max(15, Number(hours) * 60);
  if (/dia/i.test(value)) return 8 * 60;
  return 60;
}

async function ensureCatalogService(serviceKey: string, label?: string) {
  const item = CATALOG[serviceKey];
  if (!item) return null;
  const categoryEntry = Object.entries(CATEGORIES).find(([, category]) =>
    category.keys.includes(serviceKey)
  );
  const categoryNum = categoryEntry ? Number(categoryEntry[0]) : null;
  const menuOrder = categoryEntry ? categoryEntry[1].keys.indexOf(serviceKey) : 0;
  const created = await prisma.service.upsert({
    where: { catalogKey: serviceKey },
    update: { active: true, showInWhatsApp: true },
    create: {
      catalogKey: serviceKey,
      name: label || item.label,
      description: item.short,
      price: new Prisma.Decimal(item.hatchMin),
      durationMin: catalogDurationMinutes(serviceKey),
      active: true,
      showInWhatsApp: true,
      categoryNum,
      menuOrder: Math.max(0, menuOrder),
      priceHatchMin: new Prisma.Decimal(item.hatchMin),
      priceHatchMax: new Prisma.Decimal(item.hatchMax),
      priceSuvMin: new Prisma.Decimal(item.suvMin),
      priceSuvMax: new Prisma.Decimal(item.suvMax),
      timeEstimate: item.time,
      whatsappShort: item.short,
      whatsappPitch: item.pitch,
    },
  });
  console.log("[WhatsApp Catalog] Serviço oficial sincronizado:", serviceKey, created.id);
  return created;
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

  const existing = await prisma.service.findFirst({
    where: { active: true, OR: ors } as any,
  });
  if (existing || !serviceKey) return existing;
  return ensureCatalogService(serviceKey);
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

/** Por quantos dias à frente o seletor procura vagas. */
const DIAS_NA_AGENDA = 28;
/** Quantos horários prontos abrem o seletor, antes das semanas. */
const ATALHOS_DE_HORARIO = 3;

type DiaDaAgenda = { iso: string; data: Date; slots: string[] };

/** Nome curto do dia: "Hoje", "Amanhã" ou o dia da semana. */
function nomeDoDia(data: Date, hoje: Date): string {
  const dias = Math.round(
    (new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime() -
      new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) /
      86_400_000
  );
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  const semana = format(data, "EEEE", { locale: ptBR }).replace("-feira", "");
  return semana.charAt(0).toUpperCase() + semana.slice(1);
}

/** Segunda-feira da semana de uma data. */
function inicioDaSemana(data: Date): Date {
  const copia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaDaSemana = copia.getDay();
  // Domingo (0) pertence à semana que começou na segunda anterior.
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  copia.setDate(copia.getDate() - recuo);
  return copia;
}

/**
 * Dias com vaga nas próximas semanas, com os horários de cada um.
 *
 * Uma consulta só cobre o período inteiro (`generateAvailableSlotsRange`), então
 * montar o seletor de semana, o de dia e o de horário não custa uma ida ao
 * banco por dia.
 */
async function carregarAgenda(durationMin: number): Promise<DiaDaAgenda[]> {
  const hoje = new Date();
  const simulador = Boolean(flowDeliveryContext.getStore()?.skipDb);

  let porDia = new Map<string, string[]>();
  try {
    porDia = await generateAvailableSlotsRange(
      format(hoje, "yyyy-MM-dd"),
      DIAS_NA_AGENDA,
      durationMin
    );
  } catch (error) {
    if (!simulador) throw error;
  }

  const dias: DiaDaAgenda[] = [];
  for (let i = 0; i < DIAS_NA_AGENDA; i++) {
    const data = addDays(hoje, i);
    if (!validBusinessDay(data)) continue;
    const iso = format(data, "yyyy-MM-dd");
    let slots = porDia.get(iso) ?? [];
    // O simulador não tem agenda real; horários de demonstração mantêm o
    // caminho completo visível no painel de teste.
    if (slots.length === 0 && simulador) slots = ["09:00", "11:00", "14:00", "16:00"];
    if (slots.length === 0) continue;
    dias.push({ iso, data, slots });
  }
  return dias;
}

/** Guarda as opções mostradas para que a resposta por número continue valendo. */
async function registrarOpcoes(
  msg: IncomingMessage,
  flow: FlowState,
  opcoes: Array<{ id: string; label: string }>,
  stage: FlowState["stage"]
) {
  flow.pickerOptions = opcoes;
  flow.stage = stage;
  await saveFlow(msg.phone, flow, msg.testMode?.skipDb);
}

/** Resolve o número digitado para o id da opção correspondente da última lista. */
function opcaoEscolhida(flow: FlowState, input: string): string | null {
  const posicao = Number(input.trim());
  if (!Number.isInteger(posicao) || posicao < 1) return null;
  return flow.pickerOptions?.[posicao - 1]?.id ?? null;
}


/**
 * Cancelar ou remarcar uma reserva já existente.
 *
 * Devolve `true` quando a mensagem foi resolvida aqui. Só entra em ação quando
 * existe um agendamento ativo — assim "cancelar" no meio de um orçamento
 * continua significando desistir da compra, e não desmarcar outro atendimento.
 */
async function handleAppointmentChange(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  input: string
): Promise<boolean> {
  const resposta = input.trim();

  if (flow.awaitingCancelConfirmation && flow.cancelAppointmentId) {
    if (/^(1|sim|s|confirmo|pode cancelar|cancela|cancelar)$/i.test(resposta)) {
      const cancelado = await cancelAppointmentFromBot({
        appointmentId: flow.cancelAppointmentId,
        motivo: "Cancelado pelo cliente no WhatsApp",
      });
      const next: FlowState = {
        ...flow,
        awaitingCancelConfirmation: false,
        cancelAppointmentId: undefined,
        stage: "ETAPA2_MAIN_MENU",
      };
      await saveFlow(msg.phone, next);
      await sendText({
        number: msg.phone,
          text: copyReserva.cancelada(
            `${format(new Date(cancelado.date), "dd/MM")} às ${cancelado.startTime}`
          ),
      });
      return true;
    }

    if (/^(2|n[ãa]o|nao|n|manter|mantenha|deixa)/i.test(resposta)) {
      const next: FlowState = {
        ...flow,
        awaitingCancelConfirmation: false,
        cancelAppointmentId: undefined,
      };
      await saveFlow(msg.phone, next);
      await sendText({
        number: msg.phone,
        text: copyReserva.mantida,
      });
      return true;
    }

    // Outra coisa qualquer não pode ficar presa na pergunta: sai do modo e
    // segue lendo a mensagem logo abaixo — quem repete "quero cancelar" recebe
    // a pergunta de novo, e qualquer outro assunto continua pelo fluxo normal.
    flow.awaitingCancelConfirmation = false;
    flow.cancelAppointmentId = undefined;
    await saveFlow(msg.phone, flow);
  }

  if (!stageAllowsAppointmentChange(flow.stage)) return false;

  const intencao = detectAppointmentChangeIntent(resposta);
  if (!intencao) return false;

  const agendamento = await fetchNextAppointment(msg.phone);
  if (!agendamento) return false;

  const quando = `*${format(new Date(agendamento.date), "dd/MM/yyyy")}* às *${agendamento.startTime}*`;

  if (intencao === "cancel") {
    const next: FlowState = {
      ...flow,
      awaitingCancelConfirmation: true,
      cancelAppointmentId: agendamento.id,
    };
    await saveFlow(msg.phone, next);
    await sendText({
      number: msg.phone,
      text: copyReserva.confirmarCancelamento(agendamento.service.name, quando),
    });
    return true;
  }

  const duracao =
    timeToMinutes(agendamento.endTime) - timeToMinutes(agendamento.startTime) ||
    agendamento.service.durationMin;
  const valor = Number(agendamento.finalPrice ?? agendamento.service.price);

  // Depois de um atendimento humano o estado da conversa é zerado, então o
  // veículo pode não estar mais no fluxo. O cadastro do cliente guarda o mesmo
  // dado e evita um resumo com "seu veículo" no lugar do carro.
  const veiculoSalvo = [agendamento.client.vehicleModel, agendamento.client.vehiclePlate]
    .filter(Boolean)
    .join(" · ");
  const next: FlowState = {
    ...flow,
    rescheduleAppointmentId: agendamento.id,
    vehicleModel: flow.vehicleModel ?? agendamento.client.vehicleModel ?? undefined,
    vehiclePlate: flow.vehiclePlate ?? agendamento.client.vehiclePlate ?? undefined,
    vehicleRaw: flow.vehicleRaw ?? agendamento.client.vehicleModel ?? undefined,
    savedVehicle: flow.savedVehicle ?? (veiculoSalvo || null),
    dbServiceId: agendamento.serviceId,
    serviceKey: agendamento.service.catalogKey ?? flow.serviceKey,
    serviceLabel: agendamento.service.name,
    serviceDurationMin: duracao,
    estimatedTime: `${duracao} min`,
    quoteMin: valor,
    quoteMax: valor,
    vehicleConfirmed: true,
    // O dia antigo não pode continuar preenchido: ele faria o fluxo pular a
    // escolha da nova data e voltar direto para os horários do mesmo dia.
    dayDate: undefined,
    dayLabel: undefined,
    startTime: undefined,
    periodLabel: undefined,
    stage: "ETAPA7_DAY",
  };
  await saveFlow(msg.phone, next);

  const ofereceu = await sendDayPicker(
    msg,
    next,
    wctx,
    copyReserva.remarcando(agendamento.service.name, quando)
  );
  if (!ofereceu) {
    await sendText({
      number: msg.phone,
      text: "Não encontrei vagas nas próximas semanas para remarcar. Responda *9* que um especialista organiza a troca com você.",
    });
  }
  return true;
}



/**
 * Tabela completa: todos os serviços com preço, agrupados por categoria.
 *
 * O menu leva a categorias e o submenu a uma delas por vez. Quem só quer
 * comparar preços precisava abrir cinco listas — e muita gente pergunta
 * exatamente isso na primeira mensagem.
 */
async function enviarTabelaDeServicos(msg: IncomingMessage, wctx: WhatsAppCatalogContext) {
  const grupos = mainMenuEntries(wctx.categories, wctx.catalog)
    .map((entrada) => {
      const categoria = wctx.categories[entrada.categoryNum];
      const itens = (categoria?.keys ?? [])
        .filter((chave) => chave !== "indeciso")
        .map((chave) => wctx.catalog[chave])
        .filter(Boolean)
        .map((item) => ({
          name: item.label,
          price: item.hatchMin > 0 ? `R$ ${item.hatchMin}` : "sob avaliação",
          duration: humanizarDuracao(item.time),
        }));
      return { title: `${entrada.icon} ${entrada.title}`, items: itens };
    })
    .filter((grupo) => grupo.items.length > 0);

  const settings = await getRuntimeSettings();
  const marca = settings?.businessName ?? "Garagem do Ka";

  const cartao = msg.testMode
    ? null
    : await generateCatalogCard({
        businessName: marca,
        groups: grupos,
        footer: "Preços para hatch · SUV e picape sob consulta",
      });

  const textoDaTabela = grupos
    .map((grupo) => {
      const linhas = grupo.items.map((item) => `• ${item.name} — ${item.price} · ${item.duration}`);
      return `*${grupo.title}*\n${linhas.join("\n")}`;
    })
    .join("\n\n");

  if (cartao) {
    await sendMedia({
      number: msg.phone,
      mediaUrl: cartao,
      caption:
        "Essa é a tabela completa 📋\n\nGuarde ou encaminhe — todos os serviços com preço e tempo.\n\n_Me diga o que seu carro precisa e eu monto a proposta, ou envie *menu*._",
    });
    return;
  }

  await sendText({
    number: msg.phone,
    text: `📋 *Tabela completa*\n\n${textoDaTabela}\n\n_Me diga o que seu carro precisa, ou envie *menu*._`,
  });
}

/**
 * Proposta em três degraus, no lugar do orçamento de uma linha só.
 *
 * Depois de saber o carro e o serviço, o fluxo antigo mandava um preço e o
 * calendário. Quem estava em dúvida entre "só lavar" e "resolver de vez" não
 * tinha como comparar sem voltar ao menu. Aqui a comparação chega pronta: o
 * serviço escolhido, ele mais o complemento que a equipe recomenda, e a opção
 * completa. Cada degrau vira um botão.
 */
async function montarProposta(
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): Promise<NonNullable<FlowState["proposalOptions"]>> {
  const baseKey = flow.serviceKey ?? "lavagem_detalhada";
  const base = wctx.catalog[baseKey];
  const precoBase = quoteForKey(baseKey, flow, wctx);
  const duracaoBase = await getFlowDurationMin(flow, wctx);

  const degraus: NonNullable<FlowState["proposalOptions"]> = [
    {
      key: baseKey,
      label: base?.label ?? flow.serviceLabel ?? "Serviço",
      price: precoBase.min,
      durationMin: duracaoBase,
    },
  ];

  // Combinações que a equipe faz na mesma visita. O cadastro de upsell do
  // painel tem prioridade; sem ele, o degrau do meio sai daqui, senão a
  // proposta chegaria com dois caminhos e perderia justamente o recomendado.
  const PARES_NATURAIS: Record<string, string> = {
    lavagem_simples: "higienizacao_tecido",
    lavagem_completa: "higienizacao_tecido",
    lavagem_detalhada: "higienizacao_tecido_completa",
    higienizacao_tecido: "lavagem_completa",
    higienizacao_couro: "lavagem_completa",
    higienizacao_tecido_completa: "lavagem_detalhada",
    higienizacao_couro_completa: "lavagem_detalhada",
    polimento_cotacao: "descontaminacao_pintura",
    revitalizacao_pintura: "lavagem_detalhada",
    descontaminacao_pintura: "lavagem_detalhada",
    cristalizacao_farois: "lavagem_completa",
    limpeza_motor: "lavagem_detalhada",
  };

  const complemento = getUpsellForKey(baseKey, wctx);
  const parKey = PARES_NATURAIS[baseKey];
  const par = parKey ? wctx.catalog[parKey] : null;
  if (complemento && precoBase.min > 0) {
    degraus.push({
      key: baseKey,
      label: `${base?.label ?? "Serviço"} + ${complemento.complement}`,
      price: precoBase.min + complemento.value,
      durationMin: duracaoBase + complemento.durationMin,
      upsellKey: complemento.complement,
      upsellLabel: complemento.complement,
    });
  }

  if (!complemento && par && precoBase.min > 0) {
    const precoPar = quoteForKey(parKey!, flow, wctx);
    if (precoPar.min > 0) {
      degraus.push({
        key: baseKey,
        label: `${base?.label ?? "Serviço"} + ${par.label}`,
        price: precoBase.min + precoPar.min,
        durationMin: duracaoBase + (CATALOG_DURATION_MIN[parKey!] ?? 90),
        upsellKey: parKey,
        upsellLabel: par.label,
      });
    }
  }

  // O degrau de cima é o serviço mais completo da casa que ainda não está na
  // proposta — é ele que responde "e se eu quiser resolver de vez?".
  const premiumKey = ["polimento_cotacao", "revitalizacao_pintura", "lavagem_detalhada"].find(
    (chave) => wctx.catalog[chave] && chave !== baseKey
  );
  if (premiumKey) {
    const premium = wctx.catalog[premiumKey];
    const precoPremium = quoteForKey(premiumKey, flow, wctx);
    degraus.push({
      key: premiumKey,
      label: premium.label,
      price: precoPremium.min,
      durationMin: CATALOG_DURATION_MIN[premiumKey] ?? 240,
    });
  }

  return degraus.slice(0, 3);
}


/** Motivo curto de cada complemento, para o cliente entender a oferta. */
/**
 * De quanto em quanto tempo cada serviço pede repetição.
 *
 * O motor de recorrência usa o mesmo intervalo para chamar o cliente de volta;
 * aqui ele serve para a confirmação já dizer quando será a próxima, em vez de
 * deixar isso por conta da memória de quem contratou.
 */
const RETORNO_EM_DIAS: Record<string, number> = {
  lavagem_simples: 21,
  lavagem_completa: 30,
  lavagem_detalhada: 45,
  higienizacao_tecido: 180,
  higienizacao_tecido_completa: 240,
  higienizacao_couro: 180,
  polimento_cotacao: 365,
  revitalizacao_pintura: 240,
  descontaminacao_pintura: 180,
  cristalizacao_farois: 365,
  limpeza_motor: 180,
};

const MOTIVO_DO_COMPLEMENTO: Record<string, string> = {
  higienizacao_tecido: "Tira mancha e odor do tecido",
  higienizacao_tecido_completa: "Bancos, teto e carpete como novos",
  higienizacao_couro: "Limpa e hidrata o couro",
  cristalizacao_farois: "Farol amarelado volta a iluminar",
  limpeza_motor: "Compartimento limpo e seguro",
  descontaminacao_vidro: "Visão limpa na chuva",
  descontaminacao_pintura: "Tira a aspereza da pintura",
  revitalizacao_pintura: "Devolve brilho à pintura opaca",
  limpeza_premium: "Acabamento de detalhe em cada canto",
};

/** Complementos que cabem na visita, sem repetir o que já foi escolhido. */
function montarComplementos(
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): NonNullable<FlowState["extrasOptions"]> {
  const jaEscolhidos = new Set(
    [flow.serviceKey, ...(flow.extrasChosen ?? []).map((extra) => extra.key)].filter(
      Boolean
    ) as string[]
  );
  // O degrau da proposta guarda o complemento pelo nome, não pela chave: sem
  // comparar os dois, a higienização já incluída aparecia de novo na lista.
  const rotulosEscolhidos = new Set(
    [flow.serviceLabel, flow.upsellLabel, ...(flow.extrasChosen ?? []).map((extra) => extra.label)]
      .filter(Boolean)
      .map((rotulo) => (rotulo as string).toLowerCase())
  );

  return Object.keys(MOTIVO_DO_COMPLEMENTO)
    .filter((chave) => !jaEscolhidos.has(chave))
    .map((chave) => ({ chave, item: wctx.catalog[chave] }))
    .filter(({ item }) => item && !rotulosEscolhidos.has(item.label.toLowerCase()))
    .filter(({ item }) => item && item.hatchMin > 0)
    // O upsell não pode custar mais que o serviço principal: deixa de ser
    // complemento e vira outra compra, que é decisão para outro momento.
    .filter(({ item }) => !flow.quoteMin || item.hatchMin <= flow.quoteMin * 1.6)
    .slice(0, 4)
    .map(({ chave, item }) => ({
      key: chave,
      label: item.label,
      price: item.hatchMin,
      durationMin: CATALOG_DURATION_MIN[chave] ?? 90,
    }));
}

/**
 * Complementos da visita.
 *
 * Ninguém abre a conversa pedindo cristalização de faróis, mas aceita quando o
 * carro já vai ficar na oficina. Oferecer aqui — depois da decisão principal e
 * antes do horário — é o único ponto do fluxo em que a informação é útil e não
 * atrapalha: o cliente já sabe o que vai fazer e ainda não fechou a agenda.
 */
async function enviarComplementos(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): Promise<boolean> {
  const complementos = montarComplementos(flow, wctx);
  if (complementos.length < 2) return false;

  const cartao = msg.testMode
    ? null
    : await generateExtrasCard({
        service: `${flow.serviceLabel ?? "Atendimento"} · ${flow.vehicleModel ?? "seu veículo"}`,
        extras: complementos.map((extra) => ({
          name: extra.label,
          price: `R$ ${extra.price}`,
          duration: duracaoLegivel(extra.durationMin),
          motivo: MOTIVO_DO_COMPLEMENTO[extra.key] ?? "",
        })),
      });

  const linhas = complementos.map(
    (extra, indice) =>
      `*${indice + 1}* ${extra.label} — R$ ${extra.price} · +${duracaoLegivel(extra.durationMin)}`
  );

  const proximo: FlowState = { ...flow, stage: "ETAPA_EXTRAS", extrasOptions: complementos };
  await saveFlow(msg.phone, proximo, msg.testMode?.skipDb);
  msg.testMode?.onFlowStateChange?.(proximo);

  if (cartao) {
    await sendMedia({
      number: msg.phone,
      mediaUrl: cartao,
      caption: `O carro já vai ficar aqui — quer aproveitar? 🛠️\n\n${linhas.join(
        "\n"
      )}\n\nResponda os números que quiser (*1,3*) ou *pular*.`,
    });
    return true;
  }

  await sendText({
    number: msg.phone,
    text: `O carro já vai ficar aqui — quer aproveitar?\n\n${linhas.join(
      "\n"
    )}\n\nResponda os números que quiser (*1,3*) ou *pular*.`,
  });
  return true;
}

function duracaoLegivel(minutos: number): string {
  if (minutos >= 480) return "1 dia";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
}

function precoLegivel(valor: number): string {
  if (!valor || valor <= 0) return "sob avaliação";
  return `R$ ${valor}`;
}

async function enviarProposta(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
): Promise<boolean> {
  const degraus = await montarProposta(flow, wctx);
  if (degraus.length < 2) return false;

  const veiculo = vehicleDisplayFromFlow(flow) || "seu veículo";
  const cartao = msg.testMode
    ? null
    : await generateProposalCard({
        vehicle: veiculo,
        problema: flow.serviceRequestContext?.slice(0, 60) ?? flow.serviceLabel ?? "",
        options: degraus.map((degrau, indice) => ({
          tier: indice === 0 ? "Resolve" : indice === 1 ? "Recomendado" : "Completo",
          name: degrau.label,
          price: precoLegivel(degrau.price),
          duration: duracaoLegivel(degrau.durationMin),
          recommended: indice === 1,
          bullets: bulletsDoServico(degrau.key, wctx),
        })),
      });

  const linhas = degraus.map(
    (degrau, indice) =>
      `*${indice + 1}* ${degrau.label} — ${precoLegivel(degrau.price)} · ${duracaoLegivel(degrau.durationMin)}`
  );

  const proximo: FlowState = { ...flow, stage: "ETAPA_PROPOSTA", proposalOptions: degraus };
  await saveFlow(msg.phone, proximo, msg.testMode?.skipDb);
  msg.testMode?.onFlowStateChange?.(proximo);

  if (cartao) {
    await sendMedia({
      number: msg.phone,
      mediaUrl: cartao,
      caption: `Montei ${degraus.length} caminhos para o *${veiculo}* 👇\n\nTodos podem ser feitos na mesma visita — a diferença é até onde a gente vai.`,
    });
    await sendText({ number: msg.phone, text: `Qual eu reservo?\n\n${linhas.join("\n")}` });
    return true;
  }

  await sendText({
    number: msg.phone,
    text: `Montei ${degraus.length} caminhos para o *${veiculo}*:\n\n${linhas.join("\n")}\n\n_Responda com o número — ou pergunte o que quiser antes._`,
  });
  return true;
}

/** Três frases curtas do que o serviço entrega, tiradas do detalhe oficial. */
function bulletsDoServico(key: string, wctx: WhatsAppCatalogContext): string[] {
  const detalhe = flowMsg(wctx).detail(key, false);
  const itens = detalhe
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.startsWith("•"))
    .map((linha) => linha.replace(/^•\s*/, ""));
  if (itens.length) return itens.slice(0, 3);
  const item = wctx.catalog[key];
  return item?.short ? [item.short] : [];
}

/**
 * Abre a escolha de data: imagem do calendário e, logo abaixo, a lista.
 *
 * A lista começa pelos horários prontos (um toque fecha data e hora) e segue
 * pelas semanas. A divisão semana → dia → horário existe porque a lista da
 * Wafly não aceita seções: sem ela, um mês de agenda viraria trinta linhas
 * seguidas, sem separação nenhuma. Assim cada tela cabe na altura do aparelho e
 * o calendário fica logo acima, como referência do mês.
 */
async function sendDayPicker(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  cabecalho?: string
): Promise<boolean> {
  // A proposta e os complementos já somaram o tempo de tudo que foi aceito;
  // recalcular pelo serviço-base descartaria essas horas e a agenda reservaria
  // menos tempo do que o atendimento leva.
  let durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow, wctx));
  if (flow.upsellAccepted && !flow.serviceDurationMin) {
    durationMin += flow.upsellDurationMin ?? 60;
  }
  flow.serviceDurationMin = durationMin;

  const agenda = await carregarAgenda(durationMin);
  if (agenda.length === 0) return false;

  const hoje = new Date();

  // Atalhos: o primeiro horário de cada um dos próximos dias com vaga.
  const atalhos = agenda.slice(0, ATALHOS_DE_HORARIO).map((dia) => ({
    id: `${dia.iso} ${dia.slots[0]}`,
    label: `${nomeDoDia(dia.data, hoje)} ${format(dia.data, "dd/MM")} · ${dia.slots[0]}`,
    description: `Primeiro horário livre · ${dia.slots.length} no dia`,
  }));

  // Semanas, com a contagem real de vagas de cada uma.
  const semanas = new Map<string, { inicio: Date; dias: number }>();
  for (const dia of agenda) {
    const inicio = inicioDaSemana(dia.data);
    const chave = format(inicio, "yyyy-MM-dd");
    const atual = semanas.get(chave) ?? { inicio, dias: 0 };
    atual.dias += 1;
    semanas.set(chave, atual);
  }

  const linhasSemana = [...semanas.entries()].map(([chave, semana], indice) => {
    const fim = addDays(semana.inicio, 5);
    const nome =
      indice === 0
        ? "Esta semana"
        : indice === 1
          ? "Próxima semana"
          : `Semana de ${format(semana.inicio, "dd/MM")}`;
    return {
      id: `semana:${chave}`,
      label: `📅 ${nome}`,
      description: `${format(semana.inicio, "dd/MM")} a ${format(fim, "dd/MM")} · ${semana.dias} ${semana.dias === 1 ? "dia" : "dias"} com vaga`,
    };
  });

  const linhas = [...atalhos, ...linhasSemana].slice(0, MAX_LIST_ROWS);
  await registrarOpcoes(
    msg,
    flow,
    linhas.map(({ id, label }) => ({ id, label })),
    "ETAPA7_DAY"
  );

  // O calendário vem primeiro, como referência visual do mês.
  const legenda = [
    cabecalho?.trim(),
    cabecalho ? "" : null,
    `📅 Escolha o dia do atendimento. Reservamos *${formatDurationLabel(durationMin)}* só para o seu veículo.`,
  ]
    .filter((linha) => linha !== null && linha !== undefined)
    .join("\n");

  // O calendário do mês inteiro pedia uma leitura de 30 dias para uma escolha
  // que quase sempre é "o quanto antes". No lugar dele vai o cartão com os três
  // primeiros horários que cabem o serviço inteiro; a lista logo abaixo continua
  // com as semanas, para quem quer outro dia.
  const cartaoHorarios =
    msg.testMode || atalhos.length === 0
      ? null
      : await generateSlotsCard({
          service: flow.serviceLabel ?? "Atendimento",
          vehicle: flow.vehicleModel ?? "seu veículo",
          duracao: formatDurationLabel(durationMin),
          slots: atalhos.map((atalho) => {
            const [iso, hora] = atalho.id.split(" ");
            const data = parse(iso, "yyyy-MM-dd", new Date());
            return {
              dia: nomeDoDia(data, hoje),
              data: format(data, "dd/MM"),
              hora,
              nota: atalho.description?.replace(/^Primeiro horário livre · /, ""),
            };
          }),
        });

  const entregaCalendario = cartaoHorarios
    ? await sendMedia({ number: msg.phone, mediaUrl: cartaoHorarios, caption: legenda })
    : await sendCalendarWithImageAndList({
        number: msg.phone,
        prompts: wctx.prompts,
        caption: legenda,
      });
  if ((entregaCalendario as any)?.error || (entregaCalendario as any)?.blocked) {
    throw new Error("Não foi possível entregar os horários imediatamente");
  }

  const entrega = await sendList({
    number: msg.phone,
    title: "Quando fica melhor?",
    description: [
      "Toque em um horário para reservar direto, ou escolha a semana para ver todos os dias.",
      "",
      `_Se preferir, escreva a data — por exemplo *${format(addDays(hoje, 7), "dd/MM")}* ou *sexta*._`,
    ].join("\n"),
    buttonText: "Ver datas",
    sections: [
      {
        title: "Datas disponíveis",
        rows: linhas.map((l) => ({ id: l.id, title: l.label, description: l.description })),
      },
    ],
  });
  if ((entrega as any)?.error || (entrega as any)?.blocked || (entrega as any)?.queued) {
    throw new Error("Não foi possível entregar as datas imediatamente");
  }
  return true;
}

/** Lista os dias com vaga de uma semana. */
async function sendWeekDays(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  inicioIso: string
): Promise<boolean> {
  const durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow, wctx));
  const agenda = await carregarAgenda(durationMin);
  const inicio = parse(inicioIso, "yyyy-MM-dd", new Date());
  const fim = addDays(inicio, 6);

  const dias = agenda.filter((dia) => dia.data >= inicio && dia.data < fim);
  if (dias.length === 0) {
    await sendText({
      number: msg.phone,
      text: "Essa semana ficou sem vaga para a duração deste serviço. Veja as outras datas abaixo.",
    });
    return sendDayPicker(msg, flow, wctx);
  }

  const hoje = new Date();
  const linhas = dias.slice(0, MAX_LIST_ROWS - 1).map((dia) => ({
    id: dia.iso,
    label: `${nomeDoDia(dia.data, hoje)} ${format(dia.data, "dd/MM")}`,
    description: `${dia.slots.length} ${dia.slots.length === 1 ? "horário livre" : "horários livres"} · a partir de ${dia.slots[0]}`,
  }));
  linhas.push({
    id: "outro-dia",
    label: "↩️ Ver outras semanas",
    description: "Voltar ao calendário",
  });

  await registrarOpcoes(
    msg,
    flow,
    linhas.map(({ id, label }) => ({ id, label })),
    "ETAPA7_DAY"
  );

  const entrega = await sendList({
    number: msg.phone,
    title: `Semana de ${format(inicio, "dd/MM")}`,
    description: "Escolha o dia e eu mostro os horários livres.",
    buttonText: "Ver dias",
    sections: [
      {
        title: "Dias com vaga",
        rows: linhas.map((l) => ({ id: l.id, title: l.label, description: l.description })),
      },
    ],
  });
  if ((entrega as any)?.error || (entrega as any)?.blocked || (entrega as any)?.queued) {
    throw new Error("Não foi possível entregar os dias imediatamente");
  }
  return true;
}

/**
 * Fecha a escolha de horário e vai direto ao resumo.
 *
 * Escolher o horário é o momento do compromisso. Antes vinham mais seis telas
 * depois dele (cupom, fidelidade, logística, pagamento, lembrete e resumo), e é
 * aí que o cliente desistia. Assumimos os padrões mais comuns e mostramos o
 * resumo; quem quiser mexer responde pelo próprio resumo.
 */
async function goToSummaryWithChosenTime(msg: IncomingMessage, flow: FlowState, chosen: string) {
  flow.startTime = chosen;
  flow.periodLabel = chosen;
  flow.needsPickup = flow.needsPickup ?? false;
  flow.paymentMethod = flow.paymentMethod ?? "Dinheiro (na loja)";
  flow.reminderEnabled = flow.reminderEnabled ?? true;
  flow.reminderPreference = flow.reminderPreference ?? "30min";
  flow.stage = "ETAPA15_SUMMARY_CONFIRM";
  await saveFlow(msg.phone, flow, msg.testMode?.skipDb);

  const resumo = await buildSummaryConfirmResponses(flow, [], msg.pushName);
  for (const resposta of resumo) {
    await sendFlowResponse(msg, resposta);
  }
}

/**
 * Reserva um horário escolhido em um toque na lista de próximos horários.
 * Revalida a agenda antes de seguir: entre a montagem da lista e o toque do
 * cliente outra reserva pode ter ocupado a vaga.
 */
async function takeOfferedSlot(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  iso: string,
  time: string
): Promise<boolean> {
  const durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow, wctx));

  let livres: string[] = [];
  try {
    livres = await generateAvailableSlots(iso, durationMin);
  } catch (error) {
    if (!flowDeliveryContext.getStore()?.skipDb) throw error;
    livres = [time];
  }
  if (flowDeliveryContext.getStore()?.skipDb && livres.length === 0) livres = [time];

  if (!livres.includes(time)) {
    await sendText({
      number: msg.phone,
      text: "Esse horário acabou de ser reservado por outro cliente 😕 Escolha outro nas opções abaixo.",
    });
    await sendDayPicker(msg, flow, wctx);
    return true;
  }

  const dia = parse(iso, "yyyy-MM-dd", new Date());
  flow.dayDate = iso;
  flow.dayLabel = dateLabel(dia, true);
  flow.availableSlots = livres;
  flow.serviceDurationMin = durationMin;
  await goToSummaryWithChosenTime(msg, flow, time);
  return true;
}

type PeriodoDoDia = "manha" | "tarde" | "noite";

const PERIODOS: Array<{ chave: PeriodoDoDia; nome: string; emoji: string; de: number; ate: number }> = [
  { chave: "manha", nome: "Manhã", emoji: "🌅", de: 0, ate: 12 },
  { chave: "tarde", nome: "Tarde", emoji: "☀️", de: 12, ate: 18 },
  { chave: "noite", nome: "Noite", emoji: "🌙", de: 18, ate: 24 },
];

function periodoDoHorario(slot: string): PeriodoDoDia {
  const hora = Number(slot.split(":")[0]);
  if (hora < 12) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

/**
 * Mostra os horários de um dia.
 *
 * Um dia cheio pode ter mais horários do que cabe em uma lista legível. Quando
 * isso acontece, a escolha passa por período (manhã, tarde, noite) antes de
 * chegar aos horários — é a mesma ideia de dividir por semana antes de dividir
 * por dia. `flow.availableSlots` guarda sempre o dia inteiro, então escrever
 * "15:30" continua funcionando mesmo que a lista mostre só a manhã.
 */
async function sendTimeList(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  todos: string[],
  opcoes?: { periodo?: PeriodoDoDia; introducao?: string }
) {
  const durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow, wctx));
  const diaLegivel = flow.dayLabel ?? flow.dayDate ?? "o dia";
  const cabeNaLista = MAX_LIST_ROWS - 1;

  const doPeriodo = opcoes?.periodo
    ? todos.filter((slot) => periodoDoHorario(slot) === opcoes.periodo)
    : todos;

  // Dia cheio demais para uma lista só: primeiro o período, depois o horário.
  if (!opcoes?.periodo && doPeriodo.length > cabeNaLista) {
    const linhas = PERIODOS.map((periodo) => {
      const horarios = todos.filter((slot) => periodoDoHorario(slot) === periodo.chave);
      if (horarios.length === 0) return null;
      return {
        id: `periodo:${periodo.chave}`,
        label: `${periodo.emoji} ${periodo.nome}`,
        description: `${horarios.length} horários · ${horarios[0]} às ${horarios[horarios.length - 1]}`,
      };
    }).filter((linha): linha is { id: string; label: string; description: string } => linha !== null);

    linhas.push({
      id: "outro-dia",
      label: "↩️ Escolher outro dia",
      description: "Voltar ao calendário",
    });

    await registrarOpcoes(
      msg,
      flow,
      linhas.map(({ id, label }) => ({ id, label })),
      "ETAPA7_TIME"
    );

    await sendList({
      number: msg.phone,
      title: `Horários — ${diaLegivel}`,
      description: [
        opcoes?.introducao?.trim(),
        `São *${todos.length}* horários livres nesse dia. Escolha o período e eu mostro os horários exatos.`,
        "",
        `_Se já sabe a hora, é só escrever — por exemplo *${todos[0]}*._`,
      ]
        .filter(Boolean)
        .join("\n"),
      buttonText: "Ver períodos",
      sections: [
        {
          title: "Períodos do dia",
          rows: linhas.map((l) => ({ id: l.id, title: l.label, description: l.description })),
        },
      ],
    });
    return;
  }

  const exibidos = doPeriodo.slice(0, cabeNaLista);
  const linhas = exibidos.map((slot) => ({
    id: slot,
    label: `🕒 ${slot}`,
    description: `Termina às ${calculateEndTime(slot, durationMin)}`,
  }));
  linhas.push({
    id: "outro-dia",
    label: "↩️ Escolher outro dia",
    description: "Voltar ao calendário",
  });

  await registrarOpcoes(
    msg,
    flow,
    linhas.map(({ id, label }) => ({ id, label })),
    "ETAPA7_TIME"
  );

  await sendList({
    number: msg.phone,
    title: `Horários — ${diaLegivel}`,
    description: [
      opcoes?.introducao?.trim(),
      `O atendimento leva *${formatDurationLabel(durationMin)}* e esse período fica reservado só para o seu veículo.`,
      doPeriodo.length > exibidos.length
        ? `\n_Há mais horários nesse dia; se quiser outro, é só escrever a hora._`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
    buttonText: "Escolher horário",
    sections: [
      {
        title: "Horários livres",
        rows: linhas.map((l) => ({ id: l.id, title: l.label, description: l.description })),
      },
    ],
  });
}

async function proceedToTimeSelection(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
) {
  let durationMin = await getFlowDurationMin(flow, wctx);
  if (flow.upsellAccepted) durationMin += flow.upsellDurationMin ?? 60;

  if (!flow.dayDate) return;

  let todos: string[] = [];
  try {
    todos = await generateAvailableSlots(flow.dayDate, durationMin);
  } catch (error) {
    if (!flowDeliveryContext.getStore()?.skipDb) throw error;
    console.warn("[WhatsApp Flow] Agenda indisponível no simulador; usando horários de demonstração.", error);
  }
  if (todos.length === 0 && flowDeliveryContext.getStore()?.skipDb) {
    todos = ["09:00", "11:00", "14:00", "16:00"];
  }

  flow.serviceDurationMin = durationMin;
  // O dia inteiro fica guardado mesmo quando a lista mostra só um período:
  // é ele que valida um horário escrito à mão.
  flow.availableSlots = todos;

  if (todos.length === 0) {
    flow.stage = "ETAPA7_DAY";
    delete flow.availableSlots;
    await saveFlow(msg.phone, flow, msg.testMode?.skipDb);
    await sendText({
      number: msg.phone,
      text: `Não encontrei uma janela livre em *${flow.dayLabel ?? "esse dia"}* para a duração deste serviço. Vamos ver outra data:`,
    });
    await sendDayPicker(msg, flow, wctx);
    return;
  }

  // Preferência dita na conversa ("de manhã", "à tarde") abre direto no período.
  const preferencia = flow.requestedTimePreference;
  const periodoPreferido: PeriodoDoDia | undefined =
    preferencia === "morning"
      ? "manha"
      : preferencia === "afternoon"
        ? "tarde"
        : preferencia === "evening"
          ? "noite"
          : undefined;
  const temNoPeriodo =
    periodoPreferido && todos.some((slot) => periodoDoHorario(slot) === periodoPreferido);

  await sendTimeList(msg, flow, wctx, todos, {
    periodo: temNoPeriodo ? periodoPreferido : undefined,
    introducao: preferencia
      ? temNoPeriodo
        ? `Estes são os horários da *${requestedPeriodLabel(preferencia)}*, como você pediu.`
        : `Não encontrei vaga na *${requestedPeriodLabel(preferencia)}* nesse dia; estas são as opções disponíveis.`
      : undefined,
  });
}

/**
 * Leva uma mensagem escrita para onde ela pertence, em qualquer etapa.
 *
 * As etapas de agendamento esperam uma opção da lista, mas o cliente escreve o
 * que quiser: "na verdade quero polimento" no meio da escolha da data, ou
 * "quanto dura?" antes de decidir. Antes essas mensagens batiam num "não
 * entendi" e o atendimento travava. Aqui a etapa dá o primeiro palpite; só
 * quando ela não reconhece a resposta é que este roteador tenta entender a
 * intenção — e devolve `true` quando assumiu a conversa.
 *
 * A ordem importa: pedido concreto (serviço/categoria) antes de dúvida, porque
 * "quero saber sobre polimento" é as duas coisas e a mais útil é abrir o
 * serviço.
 */
async function routeFreeText(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  input: string
): Promise<boolean> {
  const texto = input.trim();
  if (texto.length < 2) return false;
  // Um número solto é resposta de menu, não mudança de assunto.
  if (/^\d{1,2}$/.test(texto)) return false;

  if (wantsHumanHandoff(texto)) {
    await handleHumanHandoffRequest(msg, flow);
    return true;
  }

  const servico = detectServiceKey(texto);
  if (servico && servico !== "indeciso" && servico !== flow.serviceKey) {
    await activateService(msg, { ...flow, serviceRequestContext: texto.slice(0, 500) }, servico, wctx);
    return true;
  }

  const categoria = detectCategoryNum(texto);
  if (categoria && wctx.categories[categoria]?.keys.length) {
    await saveFlow(
      msg.phone,
      { ...flow, stage: "ETAPA2_SUB", categoryNum: categoria },
      msg.testMode?.skipDb
    );
    await sendText({ number: msg.phone, text: subMenuForCategoryCtx(categoria, wctx) });
    return true;
  }

  if (looksLikeQuestion(texto) || wantsDoubt(texto, null)) {
    // A dúvida é respondida sem sair do lugar: a etapa continua a mesma e o
    // cliente recebe, logo em seguida, a mesma pergunta que estava pendente.
    const resposta = await buildCustomerDoubtAnswer(texto, flow, ctx, wctx);
    await sendText({ number: msg.phone, text: resposta, voiceReply: true });
    await resendCurrentStep(msg, flow, wctx);
    return true;
  }

  return false;
}

/**
 * Repete a pergunta da etapa atual depois de um desvio (uma dúvida, por
 * exemplo), para o cliente não ficar sem saber o que responder.
 */
async function resendCurrentStep(
  msg: IncomingMessage,
  flow: FlowState,
  wctx: WhatsAppCatalogContext
) {
  switch (flow.stage) {
    case "ETAPA7_DAY":
    case "ETAPA7_CUSTOM_DAY":
      await sendDayPicker(msg, flow, wctx);
      return;
    case "ETAPA7_TIME":
      if (flow.availableSlots?.length) {
        await sendTimeList(msg, flow, wctx, flow.availableSlots);
        return;
      }
      await sendDayPicker(msg, flow, wctx);
      return;
    case "ETAPA4_VEHICLE":
      await sendText({ number: msg.phone, text: vehicleMissingCopy(flow, wctx.prompts) });
      return;
    case "ETAPA2_SUB":
      if (flow.categoryNum) {
        await sendText({ number: msg.phone, text: subMenuForCategoryCtx(flow.categoryNum, wctx) });
        return;
      }
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(flow, msg.pushName) });
      return;
    default:
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(flow, msg.pushName) });
  }
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
  if (!client || (!flow.dbServiceId && !flow.serviceKey) || !flow.dayDate || !startTime) {
    return { appointment: null, conflict: false };
  }

  const service = flow.dbServiceId
    ? await prisma.service.findUnique({ where: { id: flow.dbServiceId } })
    : flow.serviceKey
      ? await ensureCatalogService(flow.serviceKey, flow.serviceLabel)
      : null;
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
  // A confirmação do veículo já demonstra intenção de agendar. Evitamos uma
  // segunda pergunta de confirmação e seguimos direto para o calendário.
  if (quote.min > 0) {
    if (flow.dayDate) {
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: quoteText });
      await proceedToTimeSelection(msg, flow, wctx);
    } else {
      // O orçamento vira a legenda do calendário, e a lista de datas vem logo
      // abaixo dele. A frase padrão do prompt já aponta para o calendário, então
      // só o que fala em "abaixo" precisa sair, para não repetir a instrução.
      const textoDoCalendario = quoteText.replace(
        /\n*_Agora escolha o melhor dia no calend[aá]rio abaixo\._/i,
        ""
      );
      // Antes do calendario vem a proposta: o cliente compara os tres caminhos
      // e o horario so aparece depois que ele decide o que quer fazer.
      if (!flow.proposalChosen && (await enviarProposta(msg, flow, wctx))) return;

      const ofertou = await sendDayPicker(msg, flow, wctx, textoDoCalendario);
      if (!ofertou) {
        // Agenda cheia no mês: resta o calendário com a resposta livre por data.
        const delivery = await sendCalendarWithImageAndList({
          number: msg.phone,
          prompts: wctx.prompts,
          caption: quoteText,
        });
        if ((delivery as any)?.error || (delivery as any)?.blocked || (delivery as any)?.queued) {
          throw new Error("Não foi possível entregar o calendário imediatamente");
        }
        await saveFlow(msg.phone, flow);
      }
    }
    return;
  }

  const delivery = await sendText({ number: msg.phone, text: quoteText });
  if ((delivery as any)?.error || (delivery as any)?.blocked || (delivery as any)?.queued) {
    throw new Error("Não foi possível entregar a estimativa imediatamente");
  }
  await saveFlow(msg.phone, flow);
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
    // Cliente conhecido volta direto numa oferta fechável, em vez do menu.
    if (await offerRepeatIfPossible(msg, { ...flow, awaitingPostConfirmationReturn: false })) return;

    // Só a saudação abre a jornada com a pergunta do veículo. Quem volta já
    // dizendo o que quer ("9", "cancelar", "quero polimento") tinha a mensagem
    // trocada por essa pergunta e precisava repetir o pedido.
    if (!isGreetingOrSmallTalk(input)) {
      flow = { ...flow, awaitingPostConfirmationReturn: false };
      await saveFlow(msg.phone, flow);
    } else {
      const next: FlowState = {
        ...flow,
        awaitingPostConfirmationReturn: false,
        awaitingReturningVehicleChoice: true,
        stage: "ETAPA2_MAIN_MENU",
      };
      await saveFlow(msg.phone, next);
      await sendText({
        number: msg.phone,
        text: `Olá, *${clientDisplayName(next, msg.pushName)}*! Que bom falar com você novamente.\n\nO novo atendimento será para o mesmo veículo, *${next.savedVehicle ?? vehicleDisplayFromFlow(next)}${next.savedVehiclePlate ? ` · ${next.savedVehiclePlate}` : ""}*?\n\n*1* ✅ Mesmo veículo\n*2* 🚗 Outro veículo`,
      });
      return;
    }
  }

  // Resposta à oferta de repetição (caminho rápido do cliente recorrente).
  if (flow.repeatOffer) {
    const oferta = flow.repeatOffer as RepeatOffer;
    const escolha = parseRepeatChoice(input, oferta);

    if (escolha.kind === "slot") {
      const pronto: FlowState = {
        ...flow,
        repeatOffer: undefined,
        stage: "ETAPA15_SUMMARY_CONFIRM",
        dbServiceId: oferta.serviceId,
        serviceLabel: oferta.serviceName,
        serviceDurationMin: oferta.serviceDurationMin,
        quoteMin: oferta.servicePrice,
        quoteMax: oferta.servicePrice,
        dayDate: escolha.slot.date,
        dayLabel: escolha.slot.label,
        startTime: escolha.slot.time,
        // Padrões do caminho rápido: sem coleta e pagamento no local. O cliente
        // ajusta depois se quiser — não vale seis perguntas para confirmar.
        needsPickup: false,
        paymentMethod: flow.paymentMethod ?? "Dinheiro (na loja)",
        reminderEnabled: flow.reminderEnabled ?? true,
        reminderPreference: flow.reminderPreference ?? "30min",
        // Sem reidratar o veículo, a confirmação saía com "seu veículo" e o bot
        // ainda pedia uma placa que o cliente já tinha cadastrada.
        vehicleModel: flow.vehicleModel ?? oferta.vehicleModel ?? undefined,
        vehiclePlate: flow.vehiclePlate ?? oferta.vehiclePlate ?? undefined,
        vehicleRaw: flow.vehicleRaw ?? oferta.vehicleLabel,
        savedVehicle: flow.savedVehicle ?? oferta.vehicleModel,
        savedVehiclePlate: flow.savedVehiclePlate ?? oferta.vehiclePlate,
        vehicleConfirmed: true,
      };
      await saveFlow(msg.phone, pronto);
      await confirmFinal(msg, pronto, ctx, wctx);
      return;
    }

    if (escolha.kind === "other-service") {
      const next: FlowState = { ...flow, repeatOffer: undefined, stage: "ETAPA2_MAIN_MENU" };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(next, msg.pushName) });
      return;
    }

    if (escolha.kind === "other-time") {
      const next: FlowState = {
        ...flow,
        repeatOffer: undefined,
        stage: "ETAPA7_DAY",
        dbServiceId: oferta.serviceId,
        serviceLabel: oferta.serviceName,
        serviceDurationMin: oferta.serviceDurationMin,
        quoteMin: oferta.servicePrice,
        quoteMax: oferta.servicePrice,
        vehicleConfirmed: true,
      };
      await saveFlow(msg.phone, next);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts: wctx.prompts });
      return;
    }

    // Não entendeu: não insiste na oferta, cai no menu para não travar.
    const next: FlowState = { ...flow, repeatOffer: undefined, stage: "ETAPA2_MAIN_MENU" };
    await saveFlow(msg.phone, next);
    await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(next, msg.pushName) });
    return;
  }

  // Placa pedida depois da reserva (ver `requiredVehicleFields`). Roda antes do
  // switch porque a resposta é uma placa solta, que nenhuma etapa entenderia.
  if (flow.awaitingPlateAfterBooking) {
    const placa = parsePlateFromText(input) ?? normalizeVehiclePlate(input);
    if (isValidVehiclePlate(placa)) {
      const next: FlowState = {
        ...flow,
        vehiclePlate: placa,
        savedVehiclePlate: placa,
        awaitingPlateAfterBooking: false,
      };
      await saveFlow(msg.phone, next);
      if (!msg.testMode?.skipDb) {
        await prisma.client
          .update({ where: { phone: normalizePhone(msg.phone) }, data: { vehiclePlate: placa } })
          .catch((error) => console.error("[WhatsApp Flow] Falha ao salvar a placa:", error));
      }
      await sendText({
        number: msg.phone,
        text: `✅ Placa *${placa}* anotada.\n\nNossa câmera vai reconhecer seu veículo na chegada e o atendimento começa sozinho. Até lá! 🤍`,
      });
      return;
    }

    if (/^(depois|dps|mais tarde|no dia|deixa|pular|n[ãa]o|nao)$/i.test(lower)) {
      await saveFlow(msg.phone, { ...flow, awaitingPlateAfterBooking: false });
      await sendText({
        number: msg.phone,
        text: "Sem problema 😊 Anotamos a placa no dia do atendimento.",
      });
      return;
    }

    // Um texto curto e sem sentido de placa ainda é tentativa de placa; qualquer
    // outra coisa é assunto novo ("quero cancelar", "quanto custa") e não pode
    // ficar presa nesta pergunta — antes o cliente recebia o mesmo aviso para
    // sempre, sem nenhuma saída.
    const pareceTentativaDePlaca = /^[a-z0-9\s-]{5,10}$/i.test(input.trim());
    if (pareceTentativaDePlaca) {
      await sendText({
        number: msg.phone,
        text: "Não consegui ler a placa. Envie no formato *BRA2E19* ou *ABC1234* — ou responda *depois* para anotarmos no dia.",
      });
      return;
    }

    await saveFlow(msg.phone, { ...flow, awaitingPlateAfterBooking: false });
    flow.awaitingPlateAfterBooking = false;
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

    // O cliente pode descrever outro carro em vez de responder *2*.
    const outroVeiculo = parseVehicleMessage(input);
    if (outroVeiculo.hasData && outroVeiculo.model) {
      const next: FlowState = {
        ...storeVehicle({ ...flow, savedVehicle: null, savedVehiclePlate: null }, input),
        awaitingReturningVehicleChoice: false,
        vehicleConfirmed: true,
        stage: "ETAPA2_MAIN_MENU",
      };
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: flowMsg(wctx).mainMenu(next, msg.pushName) });
      return;
    }

    // Qualquer outra mensagem é um pedido de verdade: agendar, remarcar,
    // cancelar ou perguntar preço. Repetir a pergunta do veículo transformava
    // esta etapa em um muro — quem escrevia "quero remarcar" recebia a mesma
    // pergunta para sempre. O veículo salvo continua valendo (basta descrever
    // outro para trocar) e a mensagem segue pelo atendimento normal.
    flow = { ...flow, awaitingReturningVehicleChoice: false, vehicleConfirmed: true };
    await saveFlow(msg.phone, flow);
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
      await sendText({ number: msg.phone, text: await menuForStage(next, wctx, msg.pushName) });
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
      const resumePrompt = doubtResumePrompt(contextualFlow);
      if (resumePrompt) {
        await sendText({ number: msg.phone, text: resumePrompt, voiceReply: false });
      }
      return;
    }

    // Respostas naturais como "quero agendar", "pode ser" ou o nome de um
    // serviço continuam na etapa pausada, sem obrigar o cliente a escolher 1/2.
    await saveFlow(msg.phone, resumedFlow);
    await processNumberedFlowInternal(msg, resumedFlow);
    return;
  }

  // Cancelar e remarcar vêm antes dos comandos globais: "quero cancelar meu
  // agendamento" casa com o padrão de "meus agendamentos" e era respondido com
  // a lista da própria reserva, sem nunca cancelar nada.
  if (await handleAppointmentChange(msg, flow, wctx, input)) {
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
      text: `Anotei sua preferência por *${availabilityFlow.dayLabel ?? availabilityFlow.dayDate ?? "esta data"}*. O serviço considerado é *${availabilityFlow.serviceLabel ?? wctx.catalog[selectedService]?.label ?? "o serviço escolhido"}*.\n\n${await menuForStage(availabilityFlow, wctx, msg.pushName)}`,
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
    // "oi" e "bom dia" são começo de conversa, não confirmação. Respondê-los com
    // "Claro 😊" no meio de uma etapa antiga soava fora de contexto — e quando a
    // etapa não tinha menu próprio o cliente recebia um beco sem saída.
    const abertura = isConversationOpener(input);
    const saudacao = abertura
      ? `${greetingByTime()}${flow.customerName ? `, *${flow.customerName}*` : ""}! 😊`
      : "Claro 😊";
    await sendText({
      number: msg.phone,
      text: `${saudacao}

${await menuForStage(flow, wctx, msg.pushName)}`,
    });
    return;
  }

  if (
    !isShortMenuPick &&
    !num &&
    flow.stage !== "ETAPA1_AWAITING_NAME"
  ) {
    const questionByRule = looksLikeQuestion(input);
    const analysis = questionByRule || !shouldAnalyzeFreeTextIntent(flow.stage, input)
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
      const resumePrompt = doubtResumePrompt(contextualFlow);
      if (resumePrompt) {
        await sendText({ number: msg.phone, text: resumePrompt, voiceReply: false });
      }
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
      const directName = looksLikePersonName(input) ? input.split(/\s+/)[0] : null;
      const validDirectName = directName && isValidCustomerName(directName) ? directName : null;
      const knownIntent =
        isGreetingOrSmallTalk(input) ||
        wantsToSchedule(input, num) ||
        Boolean(serviceKey);
      const analysis = questionByRule || validDirectName || knownIntent
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
      const nameFromInput = validDirectName;
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
      // O menu mostra as categorias renumeradas sem buracos; a resposta volta
      // com a posição vista pelo cliente, não com o número da categoria.
      // O número logo depois das categorias abre a tabela inteira.
      if (num === catalogMenuNumber(wctx.categories)) {
        await enviarTabelaDeServicos(msg, wctx);
        return;
      }

      const catFromNumber = num ? categoryFromMenuNumber(wctx.categories, num) : null;
      const pick = catFromNumber ?? catFromText;

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
        // Pode ser um serviço de outra categoria ou uma dúvida antes de decidir.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;
        await sendText({
          number: msg.phone,
          text: cat
            ? `Qual opção de *${cat.title}* combina com o que você precisa? Pode escrever o nome do serviço ou tocar em uma das opções.`
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
          await advanceAfterVehicle(msg, next, wctx);
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

        // O cliente pode simplesmente descrever outro veículo em vez de responder
        // 1 ou 2 ("Civic 2021, placa BRA2E19, preto, bom estado"). Antes essa
        // mensagem era descartada e o mesmo prompt voltava, travando a conversa.
        // A regra 5 do fluxo oficial manda aproveitar o veículo reconhecido.
        const informouOutroVeiculo = parseVehicleMessage(input);
        if (informouOutroVeiculo.hasData && informouOutroVeiculo.model) {
          const next: FlowState = {
            ...storeVehicle(beginVehicleCollection(flow, true), input),
            awaitingSavedVehicleChoice: false,
          };
          await advanceAfterVehicle(msg, next, wctx);
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
        // Quem escreve algo que não é veículo normalmente mudou de assunto:
        // pediu outro serviço ou fez uma pergunta antes de informar o carro.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;
        await sendText({ number: msg.phone, text: vehicleNotUnderstood(prompts) });
        return;
      }

      await advanceAfterVehicle(msg, collected.next, wctx);
      return;
    }


    case "ETAPA_PROPOSTA": {
      const degraus = flow.proposalOptions ?? [];
      const escolhido = num && num >= 1 && num <= degraus.length ? degraus[num - 1] : null;

      if (!escolhido) {
        // Pergunta antes de decidir é o normal aqui: quem está comparando três
        // preços quer entender a diferença. A dúvida vai para o mesmo caminho
        // de sempre e a proposta continua de pé.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;
        await sendText({
          number: msg.phone,
          text: `Responda com o número do caminho que prefere:\n\n${degraus
            .map((degrau, indice) => `*${indice + 1}* ${degrau.label} — ${precoLegivel(degrau.price)}`)
            .join("\n")}`,
        });
        return;
      }

      const item = wctx.catalog[escolhido.key];
      const proximo: FlowState = {
        ...flow,
        proposalChosen: true,
        proposalOptions: undefined,
        serviceKey: escolhido.key,
        // Com complemento, o rotulo combinado fica so na proposta: o resumo ja
        // soma servico + upsell, e usar o combinado aqui repetia o complemento.
        serviceLabel: escolhido.upsellLabel
          ? wctx.catalog[escolhido.key]?.label ?? escolhido.label
          : escolhido.label,
        dbServiceId: wctx.dbServiceIdByKey[escolhido.key] ?? flow.dbServiceId,
        serviceDurationMin: escolhido.durationMin,
        estimatedTime: duracaoLegivel(escolhido.durationMin),
        quoteMin: escolhido.price,
        quoteMax: escolhido.price,
        upsellAccepted: Boolean(escolhido.upsellKey),
        upsellLabel: escolhido.upsellLabel,
        stage: "ETAPA7_DAY",
      };
      await saveFlow(msg.phone, proximo, msg.testMode?.skipDb);
      msg.testMode?.onFlowStateChange?.(proximo);

      // Complementos entram entre a decisão e a agenda: o cliente já sabe o que
      // vai fazer e ainda não escolheu horário, então a oferta não atrapalha.
      if (!proximo.extrasDone && (await enviarComplementos(msg, proximo, wctx))) return;

      const ofereceu = await sendDayPicker(
        msg,
        proximo,
        wctx,
        `Fechado: *${escolhido.label}* — ${precoLegivel(escolhido.price)} · ${duracaoLegivel(escolhido.durationMin)}${item ? "" : ""}`
      );
      if (!ofereceu) {
        await sendText({
          number: msg.phone,
          text: "Não encontrei vaga nas próximas semanas para esse serviço. Responda *9* que a equipe encaixa você.",
        });
      }
      return;
    }

    case "ETAPA_EXTRAS": {
      const oferecidos = flow.extrasOptions ?? [];
      const pulou = /^(pular|pula|n[ãa]o|nao|nenhum|s[óo] isso|assim est[áa] bom|0)$/i.test(input.trim());

      const escolhidos = pulou
        ? []
        : (input.match(/\d+/g) ?? [])
            .map((numero) => Number(numero))
            .filter((numero) => numero >= 1 && numero <= oferecidos.length)
            .map((numero) => oferecidos[numero - 1]);

      if (!pulou && escolhidos.length === 0) {
        // Pergunta sobre um complemento é dúvida legítima; a etapa não pode
        // virar um muro só porque a resposta não veio em números.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;
        await sendText({
          number: msg.phone,
          text: `Responda com os números que quiser — por exemplo *1,3* — ou *pular* para seguir só com o serviço escolhido.`,
        });
        return;
      }

      const somaPreco = escolhidos.reduce((total, extra) => total + extra.price, 0);
      const somaDuracao = escolhidos.reduce((total, extra) => total + extra.durationMin, 0);
      const proximo: FlowState = {
        ...flow,
        extrasDone: true,
        extrasOptions: undefined,
        extrasChosen: escolhidos,
        quoteMin: (flow.quoteMin ?? 0) + somaPreco,
        quoteMax: (flow.quoteMax ?? 0) + somaPreco,
        serviceDurationMin: (flow.serviceDurationMin ?? 60) + somaDuracao,
        stage: "ETAPA7_DAY",
      };
      await saveFlow(msg.phone, proximo, msg.testMode?.skipDb);
      msg.testMode?.onFlowStateChange?.(proximo);

      const resumo = escolhidos.length
        ? `Incluí ${escolhidos.map((extra) => `*${extra.label}*`).join(" e ")}. Total: *R$ ${proximo.quoteMin}*.`
        : `Seguimos só com *${flow.serviceLabel ?? "o serviço escolhido"}*.`;

      const ofereceu = await sendDayPicker(msg, proximo, wctx, resumo);
      if (!ofereceu) {
        await sendText({
          number: msg.phone,
          text: "Não encontrei vaga nas próximas semanas para essa combinação. Responda *9* que a equipe encaixa você.",
        });
      }
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

      // Um número responde a lista mostrada; a lista guarda o id de cada linha,
      // então digitar "2" vale o mesmo que tocar na segunda opção.
      const escolha = opcaoEscolhida(flow, input) ?? input.trim();

      // Atalho de horário: o id traz data e hora juntas.
      const escolhaDireta = escolha.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})$/);
      if (escolhaDireta) {
        await takeOfferedSlot(msg, flow, wctx, escolhaDireta[1], escolhaDireta[2].padStart(5, "0"));
        return;
      }

      const semanaEscolhida = escolha.match(/^semana:(\d{4}-\d{2}-\d{2})$/);
      if (semanaEscolhida) {
        await sendWeekDays(msg, flow, wctx, semanaEscolhida[1]);
        return;
      }

      if (/^outro-dia$/i.test(escolha) || /^(outro dia|ver outro dia|outra data|outra semana|ver outras semanas)$/i.test(lower)) {
        await sendDayPicker(msg, flow, wctx);
        return;
      }

      const dayParsed = parseDayInput(escolha, num);
      if (!dayParsed) {
        // Antes de dizer "não entendi", vale checar se o cliente mudou de
        // assunto — pedir outro serviço ou fazer uma pergunta no meio da
        // escolha da data é comum.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;
        await sendText({
          number: msg.phone,
          text: "Não consegui identificar a data. Envie algo como *amanhã*, *sexta* ou *15/08* — ou escolha uma das opções da lista acima.",
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

      // Um número responde a lista mostrada; o id da linha é a hora, o período
      // ou a volta para o calendário.
      const escolha = opcaoEscolhida(flow, input) ?? input.trim();

      if (/^outro-dia$/i.test(escolha) || /^(outro dia|outra data|mudar o dia|trocar o dia)$/i.test(lower)) {
        await sendDayPicker(msg, flow, wctx);
        return;
      }

      const periodoEscolhido = escolha.match(/^periodo:(manha|tarde|noite)$/);
      if (periodoEscolhido && slots.length) {
        await sendTimeList(msg, flow, wctx, slots, {
          periodo: periodoEscolhido[1] as "manha" | "tarde" | "noite",
        });
        return;
      }

      const chosen = parseTimeSelection(escolha, slots) ?? parseTimeSelection(input, slots);

      if (!chosen) {
        const tentouHorario = /^\d+$/.test(input.trim()) || /\d{1,2}[:h]\d{2}/.test(input.trim());
        if (tentouHorario) {
          await sendText({
            number: msg.phone,
            text: `Esse horário não está livre em *${flow.dayLabel ?? flow.dayDate ?? "esse dia"}*. Escolha um dos disponíveis:`,
          });
          await sendTimeList(msg, flow, wctx, slots);
          return;
        }

        // Mensagem escrita que não é horário: pode ser outro serviço ou uma
        // dúvida. A etapa é retomada depois de responder.
        if (await routeFreeText(msg, flow, ctx, wctx, input)) return;

        await sendText({
          number: msg.phone,
          text: "Qual horário fica melhor? Pode escrever a hora, como *09:00*, ou escolher na lista:",
        });
        await sendTimeList(msg, flow, wctx, slots);
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
          await saveFlow(msg.phone, flow, msg.testMode?.skipDb);
          await sendText({
            number: msg.phone,
            text: "Esse horário acabou de ser reservado por outro cliente 😕 Escolha outro:",
          });
          await sendTimeList(msg, flow, wctx, fresh);
          return;
        }
      }

      await goToSummaryWithChosenTime(msg, flow, chosen);
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
      return "";
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

function vitrificationDoubtAnswer(question: string): string | null {
  if (!/vitrif|cer[aâ]mic|coating/i.test(question)) return null;
  if (/lavar|lavagem|depois|manuten|conservar|cuidar/i.test(question)) {
    return "Sim. Depois do período de cura indicado pela equipe, o veículo pode ser lavado normalmente. Para preservar a vitrificação, recomendamos shampoo automotivo de pH neutro, microfibra limpa e evitar produtos abrasivos ou lavagem com escova.";
  }
  if (/sol|uv|vantagem|benef[ií]cio|prote[cç][aã]o/i.test(question)) {
    return "A vitrificação cria uma camada cerâmica que ajuda a proteger contra raios UV, sujeira e contaminantes, além de facilitar a lavagem e prolongar o brilho. Ela reduz o desgaste, mas não torna a pintura imune a riscos ou impactos.";
  }
  if (/garantia|dura|tempo|validade/i.test(question)) {
    return "A durabilidade e a garantia da vitrificação dependem do produto aplicado, da preparação da pintura e da manutenção. A equipe confirma essas condições na avaliação antes do serviço, sem prometer um prazo genérico.";
  }
  if (/quanto|pre[cç]o|valor|custa/i.test(question)) {
    return "O valor da vitrificação é confirmado após avaliarmos o tamanho do veículo e o estado da pintura, porque a preparação necessária interfere diretamente no resultado. Ela é organizada dentro dos nossos Pacotes Premium.";
  }
  return "A vitrificação é uma proteção cerâmica aplicada após a preparação da pintura. Ela aumenta o brilho, dificulta a aderência de sujeira e ajuda contra a ação do sol e de contaminantes; a indicação ideal depende do estado atual da pintura.";
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
  const vitrificationAnswer = vitrificationDoubtAnswer(question);
  if (vitrificationAnswer) return vitrificationAnswer;
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

/**
 * Fechamento com horário concreto.
 *
 * Depois de responder uma dúvida, o bot reimprimia o menu — devolvendo trabalho
 * a um cliente que acabou de demonstrar interesse. Quando já sabemos o serviço,
 * é melhor terminar com duas datas reais para ele só escolher.
 */
async function closingSlotOffer(flow: FlowState): Promise<string | null> {
  const duracao = flow.serviceDurationMin ?? 60;
  const agora = new Date();
  const encontrados: string[] = [];
  for (let i = 0; i <= 7 && encontrados.length < 2; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let livres: string[] = [];
    try {
      livres = await generateAvailableSlots(iso, duracao);
    } catch {
      continue;
    }
    const agoraMin = agora.getHours() * 60 + agora.getMinutes();
    const validos = i === 0
      ? livres.filter((h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) > agoraMin + 60)
      : livres;
    if (validos.length) {
      encontrados.push(`*${encontrados.length + 1}* 📅 ${slotLabel(iso, agora)} às *${validos[0]}*`);
    }
  }
  if (encontrados.length < 1) return null;
  return [`Posso reservar um destes para você?`, "", ...encontrados, "", "*3* 🔧 Ver outros serviços"].join("\n");
}

async function menuForStage(
  flow: FlowState,
  wctx: WhatsAppCatalogContext,
  pushName?: string
): Promise<string> {
  const msgH = flowMsg(wctx);
  switch (flow.stage) {
    case "ETAPA2_MAIN_MENU":
      return msgH.mainMenu(flow, pushName);
    case "ETAPA5_QUOTE":
    case "ETAPA3_SERVICE_ACTION": {
      // Serviço já escolhido: oferecer horário converte melhor que repetir menu.
      if (flow.serviceKey || flow.dbServiceId) {
        const oferta = await closingSlotOffer(flow).catch(() => null);
        if (oferta) return oferta;
      }
      return flow.stage === "ETAPA5_QUOTE"
        ? `*1* Agendar | *2* Outro serviço | *3* Dúvida`
        : serviceActionMenu(wctx.prompts);
    }
    default:
      // "Digite *menu* para ver opções" devolvia o trabalho ao cliente e era o
      // que ele recebia ao mandar um simples "oi" numa etapa intermediária.
      // Qualquer etapa sem menu próprio mostra o menu principal de verdade.
      return msgH.mainMenu(flow, pushName);
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
    const delivery = await sendText({
      number: msg.phone,
      text: `Combinado. Pagamento em *${flow.paymentMethod}* no atendimento.\n\n${reminderChoice(prompts)}`,
    });
    if ((delivery as any)?.error || (delivery as any)?.queued) throw new Error("Falha ao entregar a etapa de lembrete");
    await saveFlow(msg.phone, flow);
    return;
  }

  if (!isNoPix && selectedNum === 1 && !ctx.pixKey) {
    flow.paymentMethod = "PIX (no atendimento)";
    flow.pixPaymentType = "delivery";
    flow.stage = "ETAPA14_REMINDER";
    const delivery = await sendText({
      number: msg.phone,
      text: `Perfeito. O pagamento será feito por *PIX no dia do atendimento*.\n\n${reminderChoice(prompts)}`,
    });
    if ((delivery as any)?.error || (delivery as any)?.queued) throw new Error("Falha ao entregar a etapa de lembrete");
    await saveFlow(msg.phone, flow);
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
  const appointment = appointments.sort((a, b) => (priority[b.status] ?? 0) - (priority[a.status] ?? 0))[0] ?? null;
  if (!appointment) return null;

  let operationalStatus = appointment.status as string;
  if (appointment.status === "IN_PROGRESS") {
    const exitEvents = await prisma.auditLog.findMany({
      where: {
        action: "GATE_VISION_EXIT",
        createdAt: { gte: appointment.updatedAt },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const exitedForThisAppointment = exitEvents.some((event) => {
      const data = event.data;
      return Boolean(data && typeof data === "object" && !Array.isArray(data) && data.appointmentId === appointment.id && data.matched === true);
    });
    if (exitedForThisAppointment) operationalStatus = "FINALIZING";
  }
  return { ...appointment, operationalStatus };
}

function serviceStatusCopy(status: string) {
  if (status === "FINALIZING") {
    return {
      label: "Em finalização",
      message: "A lavagem foi concluída e seu veículo está passando pelo acabamento e pela conferência final. Avisaremos por aqui assim que estiver pronto.",
    };
  }
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
      text: slotUnavailable(flow.dayLabel ?? flow.dayDate ?? "este dia", "", wctx.prompts),
    });
    await sendTimeList(msg, flow, wctx, fresh);
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

  // Remarcação: o horário antigo só é liberado depois que o novo existe, para o
  // cliente nunca ficar sem reserva se a vaga escolhida for tomada no meio.
  if (flow.rescheduleAppointmentId && !msg.testMode?.skipDb) {
    try {
      await cancelAppointmentFromBot({
        appointmentId: flow.rescheduleAppointmentId,
        motivo: "Remarcado pelo cliente no WhatsApp",
      });
    } catch (error) {
      console.error("[confirmFinal] Não foi possível liberar o horário antigo:", error);
    }
    flow.rescheduleAppointmentId = undefined;
  }

  // Os complementos aceitos entram no nome do atendimento: sem eles o resumo
  // cobrava um total que os serviços listados não explicavam.
  const services = [
    flow.serviceLabel,
    flow.upsellAccepted ? flow.upsellLabel : null,
    flow.packageKey,
    ...(flow.extrasChosen ?? []).map((extra) => extra.label),
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
      day: customerDayDisplay(flow) ?? "—",
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
    // A placa deixou de bloquear a venda; é pedida agora, com a reserva já
    // feita, para o portão conseguir identificar o veículo na chegada.
    awaitingPlateAfterBooking: !flow.vehiclePlate,
  };

  // A confirmação vira o ticket da reserva: é o que o cliente guarda, mostra na
  // chegada e usa para conferir a placa que a câmera do portão vai ler.
  const ticket = msg.testMode
    ? null
    : await generateTicketCard({
        code: `#KA-${result.appointment.id.slice(-4).toUpperCase()}`,
        name,
        vehicle: vehicleDisplayFromFlow(flow),
        plate: flow.vehiclePlate ?? "",
        service: services || flow.serviceLabel || "Atendimento",
        date: customerDayDisplay(flow) ?? "—",
        time: flow.startTime ?? flow.periodLabel ?? "—",
        price: `R$ ${totalValue.toFixed(2).replace(".", ",")}`,
        address: ctx.address || "nosso endereço",
      });

  // Três ações que o cliente faria à mão a partir do texto: traçar a rota,
  // salvar o compromisso e lembrar de voltar. O WhatsApp transforma cada link
  // em um toque, e nenhum deles depende de chave de API.
  const inicioDoAtendimento = flow.dayDate && flow.startTime
    ? parse(`${flow.dayDate} ${flow.startTime}`, "yyyy-MM-dd HH:mm", new Date())
    : null;
  const linkRota = rotaNoMapa(ctx.address || "");
  const linkAgenda = inicioDoAtendimento
    ? eventoNaAgenda({
        titulo: `${services || flow.serviceLabel || "Atendimento"} — ${ctx.businessName}`,
        inicio: inicioDoAtendimento,
        duracaoMin: flow.serviceDurationMin ?? 90,
        local: ctx.address || ctx.businessName,
        detalhes: `Veículo: ${vehicleDisplayFromFlow(flow)}`,
      })
    : null;
  const retorno = proximaManutencao(
    inicioDoAtendimento ?? new Date(),
    flow.serviceKey ? RETORNO_EM_DIAS[flow.serviceKey] : null
  );

  const extras = [
    linkRota ? `🗺️ *Como chegar:* ${linkRota}` : null,
    linkAgenda ? `🗓️ *Salvar na agenda:* ${linkAgenda}` : null,
    retorno ? `🔁 Recomendo repetir por volta de *${retorno}* — eu te lembro.` : null,
  ].filter(Boolean);
  const corpoDaConfirmacao = extras.length
    ? [confirmBody, ...extras].join("\n\n")
    : confirmBody;

  const confirmationDelivery = ticket
    ? await sendMedia({ number: msg.phone, mediaUrl: ticket, caption: corpoDaConfirmacao })
    : await sendText({ number: msg.phone, text: corpoDaConfirmacao });
  if (
    (confirmationDelivery as any)?.error ||
    (confirmationDelivery as any)?.blocked ||
    (confirmationDelivery as any)?.queued
  ) {
    // A reserva já existe e fica ligada à sessão por pendingAppointmentId.
    // Mantemos a etapa de confirmação para que um retry apenas reenvie a
    // confirmação, sem criar outro agendamento.
    throw new Error("A reserva foi criada, mas a confirmação não foi entregue imediatamente");
  }

  await saveFlow(msg.phone, menuFlow, msg.testMode?.skipDb);
  if (!msg.testMode?.skipDb) {
    await prisma.whatsAppSession.updateMany({
      where: { phone: normalizePhone(msg.phone) },
      data: { pendingAppointmentId: null },
    });
  }

  if (menuFlow.awaitingPlateAfterBooking) {
    await sendText({
      number: msg.phone,
      text: [
        "🔠 *Só falta a placa*",
        "",
        `Com ela nossa câmera reconhece o *${flow.vehicleModel ?? "seu veículo"}* na chegada e já inicia o atendimento — você nem precisa avisar que chegou.`,
        "",
        "_Exemplo: BRA2E19._ Se preferir, responda *depois* e anotamos no dia.",
      ].join("\n"),
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
    // Endereço, horário e o que fazemos vivem no cartão da marca, que é como
    // esta apresentação chega ao cliente. O texto fica com o que a imagem não
    // diz: quem está falando e o que essa conversa resolve.
    msg.initialWelcomePrefix = [
      `Olá! Aqui é a assistente da *${ctx.businessName}* 🚗`,
      "",
      abWelcomeVariant === "A"
        ? "Cuido do seu atendimento do início ao fim: indico o serviço certo, mostro o preço e reservo o horário."
        : "Vou entender o que seu carro precisa, mostrar o preço e reservar o melhor horário para você.",
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
    const availabilityRequest = isAvailabilityRequest(input);
    const knownInitialIntent =
      isGreetingOrSmallTalk(input) ||
      availabilityRequest ||
      wantsToSchedule(input, onlyNumber(input)) ||
      Boolean(serviceKey);
    // Saudações, opções, serviços e pedidos de agenda já são inequívocos.
    // Consultar a IA nesses casos só adiciona latência e pode bloquear o fluxo
    // quando um provedor está sem quota. IA fica reservada para texto ambíguo.
    const analysis = questionByRule || knownInitialIntent
      ? null
      : await analyzeWhatsAppMessage({
          text: input,
          stage: "ETAPA1_AWAITING_NAME",
          pushName: msg.pushName,
          ctx,
        });
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
      const resumePrompt = profileName
        ? doubtResumePrompt(initialState)
        : "Para personalizar o atendimento, como posso te chamar? 😊\n_Envie somente seu primeiro nome._";
      if (resumePrompt) await sendTextWrapper(msg, resumePrompt);
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
          ? `Olá, *${returningName}*! Que bom ter você de volta 😊\n\nEste atendimento será para o mesmo veículo, *${savedVehicle}${savedVehiclePlate ? ` · ${savedVehiclePlate}` : ""}*?\n\n*1* ✅ Mesmo veículo\n*2* 🚗 Outro veículo\n\n_Você também pode responder com suas palavras._`
          : flowMsg(wctx).mainMenu(returningState, msg.pushName),
        { includesWelcome: false }
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
      {
        includesWelcome: !availabilityRequest && !understoodSchedule,
        voiceReply: false,
        // Abertura pura vira cartão da marca com o texto na legenda.
        welcomeCover: !availabilityRequest && !understoodSchedule,
      }
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
