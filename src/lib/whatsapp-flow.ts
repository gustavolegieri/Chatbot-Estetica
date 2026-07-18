import { AppointmentStatus, Prisma } from "@prisma/client";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { sendText, sendMedia, sendList } from "./evolution-api";
import { sendCalendarWithImageAndList, generateCalendarLegend } from "./calendar-helper";
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
import { requestHumanHandoff } from "./whatsapp-handoff";
import {
  etapa1Welcome,
  etapa2MainMenu,
  etapa4AskYear,
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
  etapa16Confirmation,
  formatHours,
  indecisiveProblemPrompt,
  indecisiveVehiclePrompt,
  packageActionText,
  invalidMenu,
  packageActionMenu,
  quotePitchForService,
  serviceActionMenu,
  serviceDetail,
  vehicleModelNotUnderstood,
  vehicleNotUnderstood,
  vehicleYearNotUnderstood,
  type FlowContext,
} from "./whatsapp-flow-messages";
import {
  detectCategoryNum,
  detectServiceKey,
  isGreetingOrSmallTalk,
  onlyMenuNumber,
  wantsDoubt,
  wantsOtherServices,
  wantsRefusal,
  wantsToSchedule,
} from "./whatsapp-intent";
import { buildVehicleCollectionPrompt, isValidCustomerName } from "./flow-validation";
import {
  isValidVehicle,
  looksLikePersonName,
  parseModelFromText,
  parseVehicleMessage,
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
  looksLikeQuestion,
} from "./whatsapp-ai";
import { canRedeem, findCouponByCode, redeemCoupon } from "./coupons";


const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrapper para sendText que suporta modo de teste
 */
async function sendTextWrapper(msg: IncomingMessage, text: string) {
  if (msg.testMode?.sendTextCallback) {
    await msg.testMode.sendTextCallback(text);
  } else {
    await sendText({ number: msg.phone, text });
    await delay(500);
  }
}

/**
 * Adapta o resultado do core handler para o formato do WhatsApp flow
 * Converte FlowResponse[] em chamadas de sendText/sendMedia e persiste o estado
 */
async function handleHumanHandoffRequest(msg: IncomingMessage, flow: FlowState) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { phone: normalizePhone(msg.phone) },
    select: { id: true },
  });

  const clientName = resolveValidCustomerName(flow.customerName) ?? resolveValidCustomerName(msg.pushName);

  if (session?.id) {
    await requestHumanHandoff({
      phone: msg.phone,
      sessionId: session.id,
      reason: "menu option",
      clientName: clientName ?? undefined,
    });
    return;
  }

  await sendText({
    number: msg.phone,
    text: `Entendi${clientName ? `, *${clientName}*` : ""}! 😊\n\nVou avisar a equipe da *Garagem do Ka* para te atender por aqui.`,
  });
}

async function executeCoreHandler(
  msg: IncomingMessage,
  flow: FlowState,
  handler: (state: FlowState, message: string, responses: FlowResponse[], ...args: any[]) => Promise<FlowResult>,
  ...handlerArgs: any[]
): Promise<void> {
  const responses: FlowResponse[] = [];
  const result = await handler(flow, msg.text, responses, ...handlerArgs);

  // Persistir o novo estado (apenas se não estiver em modo de teste)
  await saveFlow(msg.phone, result.nextState, msg.testMode?.skipDb);

  // Enviar as respostas
  for (const response of result.responses) {
    if (response.mediaUrl && response.mediaType) {
      if (msg.testMode?.sendTextCallback) {
        // Em modo de teste, ignora mídia por enquanto
        await msg.testMode.sendTextCallback(`[MÍDIA: ${response.mediaType}] ${response.text || ""}`);
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
        await msg.testMode.sendTextCallback(response.text);
      } else {
        await sendText({ number: msg.phone, text: response.text });
        await delay(500); // Pequeno delay entre mensagens
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

interface IncomingMessage {
  phone: string;
  text: string;
  pushName?: string;
  testMode?: {
    sendTextCallback?: (text: string) => Promise<void>;
    useRealAI?: boolean;
    skipDb?: boolean;
  };
}

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
    resolveValidCustomerName(pushName) ??
    "Cliente"
  );
}

function storeVehicle(flow: FlowState, text: string): FlowState {
  const p = parseVehicleMessage(text);
  const normalizedModel = (p.model || "").trim();
  const normalizedCondition = normalizeConditionValue(p.condition || flow.vehicleCondition);
  return {
    ...flow,
    vehicleRaw: p.summary,
    vehicleModel: normalizedModel || flow.vehicleModel,
    vehicleYear: p.year || flow.vehicleYear,
    vehicleColor: p.color || flow.vehicleColor,
    vehicleCondition: normalizedCondition,
    vehicleIsSuv: p.isSuv,
    vehicleCollectStep: undefined,
  };
}

function hasVehicleInFlow(flow: FlowState) {
  // Verifica campos estruturados (exige todos os 4)
  if (flow.vehicleModel && flow.vehicleYear && flow.vehicleColor && flow.vehicleCondition) return true;
  
  // Verifica vehicleRaw APENAS se já tem cor e condição (requisito mínimo)
  if (flow.vehicleRaw && isValidVehicle(flow.vehicleRaw) && flow.vehicleColor && flow.vehicleCondition) return true;
  
  return false;
}

function beginVehicleCollection(flow: FlowState): FlowState {
  return {
    ...flow,
    stage: "ETAPA4_VEHICLE",
    vehicleCollectStep: "model" as FlowState['vehicleCollectStep'],
    vehicleRaw: undefined,
    vehicleModel: undefined,
    vehicleYear: undefined,
    vehicleColor: undefined,
    vehicleCondition: undefined,
    vehicleIsSuv: undefined,
  };
}

async function goToVehicleStep(msg: IncomingMessage, flow: FlowState, wctx: WhatsAppCatalogContext) {
  const next = beginVehicleCollection(flow);
  await saveFlow(msg.phone, next);
  await sendText({ number: msg.phone, text: etapa4Vehicle(false, wctx.prompts) });
}

function normalizeConditionValue(value: string | null | undefined): "excelente" | "bom" | "normal" | "ruim" {
  const normalized = (value ?? "").toLowerCase().trim();
  if (!normalized) return "normal";
  if (/(excelente|novo|zero km|seminovo|otimo|ótimo)/.test(normalized)) return "excelente";
  if (/(bom|bom estado|pouco uso|bem|limpo)/.test(normalized)) return "bom";
  if (/(ruim|arranh|feio|sujei|muito sujo|mancha|oxida|opac|precisa de atenção|precisa de atencao|gasto|precisa)/.test(normalized)) {
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
  const dbService = await resolveDbService(serviceKey, item.dbMatch);
  const dbId = wctx.dbServiceIdByKey[serviceKey] ?? dbService?.id;
  await saveFlow(msg.phone, {
    ...flow,
    serviceKey,
    serviceLabel: item.label,
    dbServiceId: dbId,
    stage: "ETAPA3_SERVICE_ACTION",
  });

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
        await delay(800);
      }

      await delay(500);
      await sendText({ number: msg.phone, text: flowMsg(wctx).detail(serviceKey) });
    } catch (err) {
      console.error("[Midia] Erro ao enviar mídia do serviço:", err);
    }
  } else {
    await delay(500);
    await sendText({ number: msg.phone, text: flowMsg(wctx).detail(serviceKey) });
  }
}

function parseDayInput(input: string, num: number | null) {
  if (num && WEEKDAYS[num]) {
    const wd = WEEKDAYS[num];
    return { dayDate: nextWeekdayDate(wd.day), dayLabel: wd.label };
  }
  const lower = input.toLowerCase();
  if (/amanh/.test(lower)) {
    const d = addDays(new Date(), 1);
    return {
      dayDate: format(d, "yyyy-MM-dd"),
      dayLabel: format(d, "dd/MM (EEEE)", { locale: ptBR }),
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
  const parsed = input.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (parsed) {
    const day = parsed[1].padStart(2, "0");
    const month = parsed[2].padStart(2, "0");
    const year = parsed[3]
      ? parsed[3].length === 2
        ? `20${parsed[3]}`
        : parsed[3]
      : String(new Date().getFullYear());
    const dayDate = `${year}-${month}-${day}`;
    const parsedDate = parse(dayDate, "yyyy-MM-dd", new Date());
    const now = new Date();
    if (parsedDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return null;
    if (parsedDate.getDay() === 0) return null;
    return {
      dayDate,
      dayLabel: format(parsedDate, "dd/MM/yyyy (EEEE)", {
        locale: ptBR,
      }),
    };
  }
  return null;
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
  const complementValue = Number(flow.upsellAccepted ? (flow.quoteMax ?? 0) - serviceValue : 0);
  const pickupValue = Number(flow.pickupFee ?? 0);
  const couponValue = Number(flow.couponDiscountApplied ?? 0);
  const totalValue = Math.max(0, serviceValue + complementValue + pickupValue - couponValue);

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

  lines.push(`- **Total: R$ ${totalValue.toFixed(2).replace(".", ",")}**`);
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

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

async function saveFlow(phone: string, flow: FlowState, skipDb = false) {
  if (skipDb) {
    console.log("[WhatsApp Flow] 💾 Salvando estado do fluxo (modo de teste - sem persistência):", { phone, stage: flow.stage, welcomed: flow.welcomed });
    return;
  }
  console.log("[WhatsApp Flow] 💾 Salvando estado do fluxo:", { phone, stage: flow.stage, welcomed: flow.welcomed });
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: { metadata: flow as object },
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
  if (flow.upsellAccepted) durationMin += 60;

  if (!flow.dayDate) return;

  const slots = await generateAvailableSlots(flow.dayDate, durationMin);
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
    text: etapa7Time(
      flow.dayLabel ?? flow.dayDate,
      slots,
      formatDurationLabel(durationMin),
      prompts
    ),
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

async function createAppointment(flow: FlowState, phone: string) {
  const client = await prisma.client.findUnique({ where: { phone: normalizePhone(phone) } });
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

  const existing = await prisma.appointment.findMany({
    where: {
      date: {
        gte: dayStart,
        lt: dayEnd,
      },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { startTime: true, endTime: true },
  });

  if (overlapsExisting(startMin, durationMin, existing)) {
    return { appointment: null, conflict: true };
  }

  const baseValue = Number(flow.quoteMin ?? service.price);
  const pickupFee = Number(flow.pickupFee ?? 0);
  const couponDiscount = Number(flow.couponDiscountApplied ?? 0);
  const finalValue = Math.max(0, baseValue + pickupFee - couponDiscount);

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

  const appointment = await prisma.$transaction(async (tx) => {
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

    return created;
  });

  return { appointment, conflict: false };
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
  flow.stage = "ETAPA5_QUOTE";
  await saveFlow(msg.phone, flow);
  await sendText({
    number: msg.phone,
    text: etapa5Quote(
      flow.customerName ?? "Cliente",
      vehicleText,
      quote.label,
      quote.min,
      quote.max,
      quote.time,
      quotePitchForService(key, wctx.catalog),
      wctx.prompts
    ),
  });
}

export async function processNumberedFlow(msg: IncomingMessage, flow: FlowState) {
  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();
  const msgH = flowMsg(wctx);
  const { prompts } = wctx;
  const input = msg.text.trim();
  const num = onlyNumber(input);
  const lower = input.toLowerCase();
  const isShortMenuPick = num !== null && input.length <= 2;

  // DETECÇÃO DE CANCELAMENTO (cross-cutting) - usando core handler unificado
  // Rode antes do switch de etapas para interceptar intenções de cancelamento
  if (flow.awaitingDiscountResponse) {
    await executeCoreHandler(msg, flow, handleDiscountResponse, msg.phone);
    return;
  }

  const cancellationResult = await handleCancellationDetection(flow, input, [], msg.phone);
  if (cancellationResult) {
    await saveFlow(msg.phone, cancellationResult.nextState);
    for (const response of cancellationResult.responses) {
      await sendText({ number: msg.phone, text: response.text });
      await delay(500);
    }
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
    looksLikeQuestion(input) &&
    flow.stage !== "ETAPA10_FAQ" &&
    flow.stage !== "ETAPA1_AWAITING_NAME"
  ) {
    const aiAnswer = await answerCustomerDoubt({ question: input, flow, ctx, wctx });
    if (aiAnswer) {
      await sendText({
        number: msg.phone,
        text: `${aiAnswer}\n\n${menuForStage(flow, wctx, msg.pushName)}`,
      });
      return;
    }
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
      const serviceKey = detectServiceKey(input);
      const analysis = await analyzeWhatsAppMessage({
        text: input,
        stage: flow.stage,
        pushName: msg.pushName,
        ctx,
      });

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
          stage: "ETAPA2_MAIN_MENU",
          customerName: name,
          welcomed: true,
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

      // Se não for um nome válido, verificar se é greeting/small_talk
      if (analysis?.intent === "greeting" || analysis?.intent === "small_talk") {
        const hint =
          msg.pushName && looksLikePersonName(msg.pushName) ? msg.pushName.split(/\s+/)[0] : null;
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

      if (analysis?.intent === "doubt" && analysis.reply) {
        await sendText({
          number: msg.phone,
          text: `${analysis.reply}\n\nPara seguir, qual é o seu *nome*? 😊\n_(Só o primeiro nome)_`,
        });
        return;
      }

      // Se chegou aqui, o nome não é válido
      const hint =
        msg.pushName && looksLikePersonName(msg.pushName) ? msg.pushName.split(/\s+/)[0] : null;
      await sendText({
        number: msg.phone,
        text: hint
          ? `Não consegui identificar seu nome 😊 Pode me dizer como posso te chamar?\n_(Se for *${hint}*, pode mandar só o nome)_`
          : `Não consegui identificar seu nome 😊 Pode me dizer como posso te chamar?`,
      });
      return;
    }

    case "ETAPA2_MAIN_MENU": {
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
        await activateService(msg, flow, serviceFromText, wctx);
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
        if (looksLikeQuestion(input)) {
          const aiAnswer = await answerCustomerDoubt({ question: input, flow, ctx, wctx });
          if (aiAnswer) {
            await sendText({
              number: msg.phone,
              text: `${aiAnswer}\n\n${msgH.mainMenu(flow, msg.pushName)}`,
            });
            return;
          }
        }
        await sendText({
          number: msg.phone,
          text: invalidMenu(msgH.mainMenu(flow, msg.pushName), prompts),
        });
        return;
      }

      if (pick === MAIN_MENU_CATEGORIES) {
        await saveFlow(msg.phone, {
          ...beginVehicleCollection({ ...flow, serviceKey: "indeciso" }),
          stage: "ETAPA3_UNDECIDED_VEHICLE",
        });
        await sendText({ number: msg.phone, text: indecisiveVehiclePrompt(prompts) });
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
      if (!cat || !num || num < 1 || num > cat.keys.length) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(flow.categoryNum ? msgH.subMenu(flow.categoryNum) : msgH.mainMenu(flow, msg.pushName), prompts),
        });
        return;
      }
      const key = cat.keys[num - 1];
      await activateService(msg, flow, key, wctx);
      return;
    }

    case "ETAPA3_UNDECIDED_VEHICLE": {
      if (isValidVehicle(input)) {
        await saveFlow(msg.phone, {
          ...storeVehicle(flow, input),
          stage: "ETAPA3_UNDECIDED_PROBLEM",
        });
        await sendText({ number: msg.phone, text: indecisiveProblemPrompt(prompts) });
        return;
      }
      const step = flow.vehicleCollectStep ?? "model";
      if (step === "model") {
        const model = parseModelFromText(input);
        if (!model) {
          await sendText({ number: msg.phone, text: vehicleModelNotUnderstood(prompts) });
          return;
        }
        await saveFlow(msg.phone, {
          ...flow,
          vehicleModel: model,
          vehicleCollectStep: "year" as FlowState['vehicleCollectStep'],
        });
        await sendText({ number: msg.phone, text: etapa4AskYear(model) });
        return;
      }
      const year = parseYearFromText(input);
      if (!year) {
        await sendText({ number: msg.phone, text: vehicleYearNotUnderstood() });
        return;
      }
      const combined = `${flow.vehicleModel} ${year}`;
      await saveFlow(msg.phone, {
        ...storeVehicle(flow, combined),
        stage: "ETAPA3_UNDECIDED_PROBLEM",
      });
      await sendText({ number: msg.phone, text: indecisiveProblemPrompt() });
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
      if (!wantsToSchedule(input, num)) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(packageActionMenu(prompts), prompts),
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
      if (!wantsToSchedule(input, num)) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(serviceActionMenu()),
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
      const awaitingVehicleConfirmation = !flow.vehicleCollectStep && hasVehicleInFlow(flow);

      if (awaitingVehicleConfirmation) {
        if (/^(sim|s|confirmo)$/i.test(confirmAnswer)) {
          flow.vehicleConfirmed = true;
          await saveFlow(msg.phone, flow);
          await sendQuote(msg, flow, wctx);
          return;
        }

        if (/^(nao|não|n|2)$/i.test(confirmAnswer)) {
          const nextFlow = {
            ...flow,
            vehicleCollectStep: "model" as FlowState['vehicleCollectStep'],
            vehicleConfirmed: false,
          };
          await saveFlow(msg.phone, nextFlow);
          await sendText({
            number: msg.phone,
            text: buildVehicleCollectionPrompt({
              model: flow.vehicleModel ?? null,
              year: flow.vehicleYear ?? null,
              color: flow.vehicleColor ?? null,
              condition: flow.vehicleCondition ?? null,
            }),
          });
          return;
        }

        await sendText({
          number: msg.phone,
          text: `Por favor, responda apenas *sim* ou *não* para confirmar os dados do veículo.`,
        });
        await sendText({
          number: msg.phone,
          text: etapa4VehicleConfirmation(
            flow.vehicleModel ?? "",
            flow.vehicleYear ?? "",
            flow.vehicleColor ?? "",
            flow.vehicleCondition ?? ""
          ),
        });
        return;
      }

      // Coleta progressiva dos dados do veículo (modelo → ano → cor → estado)
      const step = flow.vehicleCollectStep ?? "model";

      if (step === "model") {
        const model = parseModelFromText(input);
        if (!model) {
          await sendText({ number: msg.phone, text: vehicleModelNotUnderstood(prompts) });
          return;
        }

        const year = parseYearFromText(input);

        if (year) {
          await saveFlow(msg.phone, {
            ...flow,
            vehicleModel: model,
            vehicleYear: year,
            vehicleCollectStep: "color" as FlowState['vehicleCollectStep'],
          });
          await sendText({
            number: msg.phone,
            text: `Anotado: ${model} ${year} 👍\n\nQual a cor do veículo?`,
          });
        } else {
          await saveFlow(msg.phone, {
            ...flow,
            vehicleModel: model,
            vehicleCollectStep: "year" as FlowState['vehicleCollectStep'],
          });
          await sendText({ number: msg.phone, text: etapa4AskYear(model) });
        }
        return;
      }

      if (step === "year") {
        const year = parseYearFromText(input);
        if (!year) {
          await sendText({ number: msg.phone, text: vehicleYearNotUnderstood() });
          return;
        }
        await saveFlow(msg.phone, {
          ...flow,
          vehicleYear: year,
          vehicleCollectStep: "color" as FlowState['vehicleCollectStep'],
        });
        await sendText({
          number: msg.phone,
          text: `Anotado: ${flow.vehicleModel} ${year} 👍\n\nQual a cor do veículo?`,
        });
        return;
      }

      if (step === "color") {
        const color = input.trim();
        if (!color || color.length < 2) {
          await sendText({
            number: msg.phone,
            text: `Não entendi a cor 😊 Pode me dizer novamente? (ex: branco, prata, preto, azul)`,
          });
          return;
        }
        await saveFlow(msg.phone, {
          ...flow,
          vehicleColor: color,
          vehicleCollectStep: "condition" as FlowState['vehicleCollectStep'],
        });
        await sendText({
          number: msg.phone,
          text: `Anotado: ${flow.vehicleModel} ${flow.vehicleYear} ${color} 👍\n\nQual o estado geral do veículo? (excelente/bom/normal/ruim)`,
        });
        return;
      }

      if (step === "condition") {
        const condition = normalizeConditionValue(input);
        const nextFlow = {
          ...flow,
          vehicleCondition: condition,
          vehicleCollectStep: undefined,
        };
        await saveFlow(msg.phone, nextFlow);

        await sendText({
          number: msg.phone,
          text: etapa4VehicleConfirmation(
            nextFlow.vehicleModel ?? "",
            nextFlow.vehicleYear ?? "",
            nextFlow.vehicleColor ?? "",
            nextFlow.vehicleCondition ?? ""
          ),
        });
        return;
      }

      const model = parseModelFromText(input);
      if (!model) {
        await sendText({ number: msg.phone, text: vehicleModelNotUnderstood(prompts) });
        return;
      }
      await saveFlow(msg.phone, {
        ...flow,
        vehicleModel: model,
        vehicleCollectStep: "year" as FlowState['vehicleCollectStep'],
      });
      await sendText({ number: msg.phone, text: etapa4AskYear(model) });
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

      // Check if first-time customer for bonus (unificado com test-bot)
      if (!flow.firstTimeBonusApplied && !flow.couponCode) {
        try {
          const existingCustomer = await prisma.client.findUnique({
            where: { phone: msg.phone }
          });

          if (!existingCustomer) {
            flow.isFirstTimeCustomer = true;

            // Usar sistema de cupom como test-bot (mais robusto)
            const coupon = await findCouponByCode("PRIMEIRA10");
            if (coupon && coupon.active) {
              flow.couponCode = "PRIMEIRA10";
              flow.firstTimeBonusDiscount = coupon.type === "percent"
                ? (flow.quoteMin ?? 0) * (Number(coupon.amount) / 100)
                : Number(coupon.amount);
            } else {
              // Fallback para cálculo direto se cupom não existir
              flow.firstTimeBonusDiscount = Math.round((flow.quoteMin ?? 0) * 0.1);
            }

            flow.stage = "ETAPA5_FIRST_TIME_BONUS";
            await saveFlow(msg.phone, flow);
            await sendText({
              number: msg.phone,
              text: `🎁 *Bônus! Primeira vez: 10% de desconto*\n\nÉ sua primeira vez aqui! Ganhou *10% de desconto* no primeiro serviço.\n\n💰 Desconto: R$ ${(flow.firstTimeBonusDiscount ?? 0).toFixed(2).replace('.', ',')}\n\n*1* ✅ Quero o desconto\n*2* ❌ Não, obrigado`,
            });
            return;
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
        await sendText({ number: msg.phone, text: generateCalendarLegend() });
        return;
      }
      const key = flow.serviceKey ?? "lavagem_detalhada";
      const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
      if (!upsell) {
        flow.stage = "ETAPA7_DAY";
        await saveFlow(msg.phone, flow);
        await sendCalendarWithImageAndList({ number: msg.phone, prompts });
        await sendText({ number: msg.phone, text: generateCalendarLegend() });
        return;
      }
      flow.upsellLabel = upsell.complement;
      flow.upsellOffered = true;
      flow.stage = "ETAPA6_UPSELL";
      await saveFlow(msg.phone, flow);
      // Alinhado com test-bot: formato simples de upsell
      // Usar valor estimado baseado na diferença entre quoteMax e quoteMin
      const upsellValue = (flow.quoteMax ?? 0) - (flow.quoteMin ?? 0);
      await sendText({
        number: msg.phone,
        text: `✨ Que tal adicionar *${upsell.complement}*?\n\n💰 **R$ ${upsellValue.toFixed(2)}** a mais\n\n*1* - Sim, incluir\n*2* - Não, obrigado`,
      });
      return;
    }

    case "ETAPA5_FIRST_TIME_BONUS": {
      if (num === 1 || /sim|s|yes|quero|aceito/i.test(lower)) {
        flow.firstTimeBonusApplied = true;
        // Apply discount to quote
        if (flow.firstTimeBonusDiscount) {
          const currentQuoteMin = flow.quoteMin ?? 0;
          const currentQuoteMax = flow.quoteMax ?? 0;
          flow.quoteMin = Math.max(0, currentQuoteMin - flow.firstTimeBonusDiscount);
          flow.quoteMax = Math.max(0, currentQuoteMax - flow.firstTimeBonusDiscount);
          flow.couponDiscountApplied = flow.firstTimeBonusDiscount;
        }
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: `✅ *Desconto aplicado!*\n\nSeu bônus de primeira compra foi ativado.\n\n💰 Novo valor: R$ ${(flow.quoteMin ?? 0).toFixed(2).replace('.', ',')}\n\nVamos continuar com o agendamento?`,
        });
        // Continue to upsell or calendar
        if (flow.upsellOffered) {
          flow.stage = "ETAPA7_DAY";
          await saveFlow(msg.phone, flow);
          await sendCalendarWithImageAndList({ number: msg.phone, prompts });
          await sendText({ number: msg.phone, text: generateCalendarLegend() });
        } else {
          const key = flow.serviceKey ?? "lavagem_detalhada";
          const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
          if (upsell) {
            flow.upsellLabel = upsell.complement;
            flow.upsellOffered = true;
            flow.stage = "ETAPA6_UPSELL";
            await saveFlow(msg.phone, flow);
            const upsellValue = (flow.quoteMax ?? 0) - (flow.quoteMin ?? 0);
            await sendText({
              number: msg.phone,
              text: `✨ Que tal adicionar *${upsell.complement}*?\n\n💰 **R$ ${upsellValue.toFixed(2)}** a mais\n\n*1* - Sim, incluir\n*2* - Não, obrigado`,
            });
          } else {
            flow.stage = "ETAPA7_DAY";
            await saveFlow(msg.phone, flow);
            await sendCalendarWithImageAndList({ number: msg.phone, prompts });
            await sendText({ number: msg.phone, text: generateCalendarLegend() });
          }
        }
        return;
      }

      if (num === 2 || /nao|não|n|no|nao quero/i.test(lower)) {
        flow.firstTimeBonusApplied = true;
        flow.firstTimeBonusDiscount = 0;
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: `Sem problema! Vamos continuar com o valor original.\n\n💰 Valor: R$ ${(flow.quoteMin ?? 0).toFixed(2).replace('.', ',')}`,
        });
        // Continue to upsell or calendar
        if (flow.upsellOffered) {
          flow.stage = "ETAPA7_DAY";
          await saveFlow(msg.phone, flow);
          await sendCalendarWithImageAndList({ number: msg.phone, prompts });
          await sendText({ number: msg.phone, text: generateCalendarLegend() });
        } else {
          const key = flow.serviceKey ?? "lavagem_detalhada";
          const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
          if (upsell) {
            flow.upsellLabel = upsell.complement;
            flow.upsellOffered = true;
            flow.stage = "ETAPA6_UPSELL";
            await saveFlow(msg.phone, flow);
            const upsellValue = (flow.quoteMax ?? 0) - (flow.quoteMin ?? 0);
            await sendText({
              number: msg.phone,
              text: `✨ Que tal adicionar *${upsell.complement}*?\n\n💰 **R$ ${upsellValue.toFixed(2)}** a mais\n\n*1* - Sim, incluir\n*2* - Não, obrigado`,
            });
          } else {
            flow.stage = "ETAPA7_DAY";
            await saveFlow(msg.phone, flow);
            await sendCalendarWithImageAndList({ number: msg.phone, prompts });
            await sendText({ number: msg.phone, text: generateCalendarLegend() });
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
      if (!num || (num !== 1 && num !== 2)) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(`*1* — Sim, quero incluir\n*2* — Não, seguir só com o serviço atual`),
        });
        return;
      }
      flow.upsellAccepted = num === 1;
      if (num === 1) {
        const upsell = getUpsellForKey(flow.serviceKey ?? "lavagem_detalhada", wctx);
        if (upsell) {
          flow.upsellLabel = upsell.complement;
          await sendText({
            number: msg.phone,
            text: `✅ Incluído! *${upsell.complement}* adicionado ao seu agendamento.`,
          });
        }
      }
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts });
      await sendText({ number: msg.phone, text: generateCalendarLegend() });
      return;
    }

    case "ETAPA7_PERIOD": {
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendCalendarWithImageAndList({ number: msg.phone, prompts });
      await sendText({ number: msg.phone, text: generateCalendarLegend() });
      return;
    }

    case "ETAPA7_DAY":
    case "ETAPA7_CUSTOM_DAY": {
      const dayParsed = parseDayInput(input, num);
      if (!dayParsed) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(etapa7Day(prompts), prompts),
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
            text: `Esse horário não está disponível. Escolha um dos horários abaixo:\n\n${slots.map((slot, index) => `*${index + 1}* - ${slot}`).join("\n")}`,
          });
          return;
        }

        await sendText({
          number: msg.phone,
          text: invalidMenu(
            etapa7Time(flow.dayLabel ?? flow.dayDate ?? "o dia", slots, formatDurationLabel(durationMin), prompts)
          ),
        });
        return;
      }

      if (flow.dayDate) {
        const fresh = await generateAvailableSlots(flow.dayDate, durationMin);
        if (!fresh.includes(chosen)) {
          flow.availableSlots = fresh;
          await saveFlow(msg.phone, flow);
          await sendText({
            number: msg.phone,
            text: `Esse horário acabou de ser reservado 😔\n\n${etapa7Time(
              flow.dayLabel ?? flow.dayDate,
              fresh,
              formatDurationLabel(durationMin),
              prompts
            )}`,
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
      if (num === 1) {
        flow.paymentMethod = "Cartão de débito";
        flow.stage = "ETAPA14_REMINDER";
        await saveFlow(msg.phone, flow);
        await sendText({ number: msg.phone, text: `🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?\n\n*1* Sim, quero lembrete\n*2* Não precisa` });
        return;
      }
      if (num === 2) {
        flow.paymentMethod = "Cartão de crédito";
        flow.stage = "ETAPA14_REMINDER";
        await saveFlow(msg.phone, flow);
        await sendText({ number: msg.phone, text: `🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?\n\n*1* Sim, quero lembrete\n*2* Não precisa` });
        return;
      }
      await sendText({
        number: msg.phone,
        text: invalidMenu(`*1* Débito\n*2* Crédito`),
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
      await executeCoreHandler(msg, flow, handleSummaryConfirm);
      return;
    }

    case "ETAPA16_CONFIRMATION": {
      // Após confirmação final, criar o agendamento
      const result = await createAppointment(flow, msg.phone);
      const appointment = result?.appointment;

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
          text: `Esse horário acabou de ser reservado 😔\n\n${etapa7Time(
            flow.dayLabel ?? flow.dayDate ?? "este dia",
            fresh,
            formatDurationLabel(durationMin),
            wctx.prompts
          )}`,
        });
        return;
      }

      // Se houver cupom aplicado, registrar redemption vinculado ao agendamento
      if (appointment?.id && flow.couponCode) {
        try {
          const client = await prisma.client.findUnique({
            where: { phone: normalizePhone(msg.phone) },
          });

          if (client?.id) {
            await redeemCoupon(flow.couponCode, client.id, appointment.id);
          }
        } catch (err) {
          console.error('[Cupon] Falha ao registrar redemption:', err);
        }
      }

      // Enviar confirmação final usando o template oficial
      await sendText({
        number: msg.phone,
        text: etapa16Confirmation(ctx.address, ctx.hours, prompts),
      });

      // Reset to initial state
      flow.stage = "ETAPA1_AWAITING_NAME";
      flow.customerName = undefined;
      await saveFlow(msg.phone, flow);
      return;
    }

    case "ETAPA10_FAQ": {
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
  if (/^(1|sim|s|quero|yes|com|buscar|entrega|delivery|levar|levem|vai)$/i.test(lower)) return true;
  if (/^(2|nao|não|n|sem|não quero|na loja|trazer|vou levar|pular|skip)$/i.test(lower)) return false;
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
        text: `Perfeito 😊 Me envie o *código do cupom* (ex: *AA*).`,
      });
    }
    return false;
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
  flow.couponError = undefined;

  flow.quoteMin = applied.flow.quoteMin;
  flow.quoteMax = applied.flow.quoteMax;
  await saveFlow(msg.phone, flow);

  const formattedCouponCode = code.toUpperCase();
  const formattedDiscount = applied.discountApplied > 0 ? `*R$ ${applied.discountApplied.toFixed(2).replace(".", ",")}*` : "*sem valor fixo*";
  const finalValue = Math.max(0, (flow.quoteMin ?? 0));
  const formattedFinalValue = `*R$ ${finalValue.toFixed(2).replace(".", ",")}*`;
  const couponName = formattedCouponCode;

  await sendText({
    number: msg.phone,
    text: `✅ Cupom *${formattedCouponCode}* aplicado com sucesso!

🎁 ${couponName}
💸 Desconto aplicado: ${formattedDiscount}
💰 Valor final do agendamento: ${formattedFinalValue}

Agora escolha a forma de pagamento.`,
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
  const max = isNoPix ? 2 : 3; // Atualizado: 2 opções sem PIX, 3 com PIX
  const min = isNoPix ? 1 : 1;

  if (!num || num < min || num > max) {
    // Usar template compacto para 3 opções
    const optionsText = isNoPix 
      ? `*1* Cartão\n*2* Dinheiro`
      : `*1* PIX\n*2* Cartão\n*3* Dinheiro`;
    await sendText({
      number: msg.phone,
      text: invalidMenu(optionsText, prompts),
    });
    return;
  }

  // Nova variante: Opção de Cartão unificado (débito + crédito)
  const methodsNoPix = ["Cartão", "Dinheiro"];
  const methodsFull = ["PIX", "Cartão", "Dinheiro"];
  const methods = isNoPix ? methodsNoPix : methodsFull;
  flow.paymentMethod = methods[num - 1];

  // Se escolher Cartão, perguntar qual tipo
  if (flow.paymentMethod === "Cartão") {
    flow.stage = "ETAPA8_PAYMENT_CARD_TYPE";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: `Qual tipo de cartão você prefere?\n\n*1* Débito\n*2* Crédito`,
    });
    return;
  }

  if (!isNoPix && num === 1 && !ctx.pixKey) {
    flow.stage = "ETAPA8_PAYMENT_NO_PIX";
    await saveFlow(msg.phone, flow);
    await sendText({ number: msg.phone, text: etapa8Payment(false, prompts) });
    return;
  }

  // Se PIX for selecionado e tiver chave PIX configurada, mostrar escolha de pagamento
  // Atualizado para seguir especificação: "💸 Como você prefere pagar via PIX?\n\n1 PIX (Pagar agora)\n2 PIX (Pagar na entrega)"
  if (!isNoPix && num === 1 && ctx.pixKey) {
    flow.stage = "ETAPA8_PIX_CHOICE";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: `💸 Como você prefere pagar via PIX?\n\n1 PIX (Pagar agora)\n2 PIX (Pagar na entrega)`,
    });
    return;
  }

  // Dinheiro vai direto para lembrete
  flow.stage = "ETAPA14_REMINDER";
  await saveFlow(msg.phone, flow);
  await sendText({ number: msg.phone, text: `🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?\n\n*1* Sim, quero lembrete\n*2* Não precisa` });
}

async function confirmFinal(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  includePix = false
) {
  const result = await createAppointment(flow, msg.phone);
  const appointment = result?.appointment;

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
      text: `Esse horário acabou de ser reservado 😔\n\n${etapa7Time(
        flow.dayLabel ?? flow.dayDate ?? "este dia",
        fresh,
        formatDurationLabel(durationMin),
        wctx.prompts
      )}`,
    });
    return;
  }

  // Se houver cupom aplicado, registrar redemption vinculado ao agendamento
  if (appointment?.id && flow.couponCode) {
    try {
      // redeemCoupon exige clientId; buscar via phone é seguro
      const client = await prisma.client.findUnique({
        where: { phone: normalizePhone(msg.phone) },
      });

      if (client?.id) {
        await redeemCoupon(flow.couponCode, client.id, appointment.id);
      }
    } catch (err) {
      console.error('[Cupon] Falha ao registrar redemption:', err);
    }
  }


  const services = [

    flow.serviceLabel,
    flow.upsellAccepted ? flow.upsellLabel : null,
    flow.packageKey,
  ]
    .filter(Boolean)
    .join(" + ");

  const totalValue = Math.max(0, Number(flow.quoteMin ?? 0) + Number(flow.pickupFee ?? 0) - Number(flow.couponDiscountApplied ?? 0));
  const value = totalValue > 0 ? `R$ ${totalValue.toFixed(2).replace(".", ",")}` : "sob consulta";

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
      value: `${Math.max(0, (flow.quoteMin ?? 0) + (flow.pickupFee ?? 0)).toFixed(2).replace(".", ",")}`,
      address: ctx.address || "nosso endereço",
      pixBlock: includePix ? etapa8PixBlock(ctx, prompts) : undefined,
    },
    prompts
  );

  const menuFlow: FlowState = {
    stage: "ETAPA2_MAIN_MENU",
    customerName: resolveValidCustomerName(flow.customerName) ?? undefined,
    welcomed: true,
  };

  await delay(600);
  await sendText({
    number: msg.phone,
    text: `${confirmBody}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${flowMsg(wctx).mainMenu(menuFlow, msg.pushName)}`,
  });

  await saveFlow(msg.phone, menuFlow);
}

/** Primeira interação: sempre etapa 1 */
export async function startFlow(msg: IncomingMessage) {
  console.log("[WhatsApp Flow] 🚀 Iniciando flow de boas-vindas");
  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();
  console.log("[WhatsApp Flow] 📤 Enviando mensagem de boas-vindas");
  await sendTextWrapper(msg, etapa1Welcome(ctx, wctx.prompts));
  console.log("[WhatsApp Flow] 💾 Salvando estado com welcomed=true");
  await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: true }, !!msg.testMode);
  console.log("[WhatsApp Flow] ✅ Flow de boas-vindas concluído");
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