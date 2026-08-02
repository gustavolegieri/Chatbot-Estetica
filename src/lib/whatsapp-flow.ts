import { AppointmentStatus, Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
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
  aiFollowup,
  evaluationRequired,
  couponApplied,
  couponCodeRequest,
  firstTimeBonusApplied,
  firstTimeBonusDeclined,
  firstTimeBonusOffer,
  formatHours,
  handoffAcknowledgement,
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
  vehicleColorInvalid,
  vehicleColorRequest,
  vehicleConditionRequest,
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
  looksLikeQuestion,
} from "./whatsapp-ai";
import { canRedeem, findCouponByCode } from "./coupons";


const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface IncomingMessage {
  phone: string;
  text: string;
  pushName?: string;
  testMode?: {
    sendTextCallback?: (text: string) => Promise<void>;
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
    await callback(params.text);
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

  // A lista interativa da Wasender é representada pela orientação de escolha.
  // A legenda já acompanha a mídia acima, portanto não a repetimos no painel.
  const dayPrompt = etapa7Day(params.prompts as any);
  const selectionPrompt = dayPrompt.replace(`${generateCalendarLegend()}\n\n`, "");
  await callback(selectionPrompt);
  return { simulated: true };
}

/**
 * Wrapper para sendText que suporta modo de teste
 */
async function sendTextWrapper(msg: IncomingMessage, text: string) {
  await flowDeliveryContext.run(msg.testMode, async () => {
    await sendText({ number: msg.phone, text });
  });
  if (!msg.testMode?.sendTextCallback) {
    await delay(500);
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
  if (flow.savedVehicle && flow.loyaltyPoints != null) return flow;

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
    loyaltyPoints: client.appointments.length * 10,
  };
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
  lower: string
): Promise<boolean> {
  const isAppointments = /\b(meus agendamentos|minhas reservas|minhas agendas|meu agendamento|meu horário|meus horários)\b/i.test(lower);
  const isPoints = /\b(meus pontos|pontos|saldo de pontos|saldo)\b/i.test(lower);
  const isReferral = /\b(indicar (?:um |uma )?amigo|indique (?:um |uma )?amigo|indicar amigo|refe?r[aê]ncia|indicação)\b/i.test(lower);
  const isAddress = /\b(endereço|localiza[cç][aã]o|onde fica|onde estamos|localização|rua|avenida|av\.?|local)\b/i.test(lower);
  const isHours = /\b(hor[aá]rio|horarios|horários|funcionamento|abertura|fechamento|atendemos|atendendo)\b/i.test(lower);
  const isPayment = /\b(pagamento|pix|cart[aã]o|dinheiro|forma de pagamento|tarifa|valor|preço|preco|custa|quanto custa)\b/i.test(lower);

  if (isAppointments) {
    const appointments = await fetchUpcomingAppointments(msg.phone);
    await sendText({ number: msg.phone, text: renderAppointmentsSummary(appointments) });
    return true;
  }

  if (isPoints) {
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

  if (isReferral) {
    const code = await createReferralCoupon();
    await sendText({
      number: msg.phone,
      text: `🎁 Seu cupom de indicação: *${code}*\n\nCompartilhe com um amigo para ele ganhar *10% de desconto* no primeiro agendamento.\n` +
        `O cupom vale por 30 dias e tem 1 uso.\n\nSe quiser, digite *menu* para voltar ao atendimento.`,
    });
    return true;
  }

  if (isAddress || isHours || isPayment) {
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
    const next: FlowState = {
      ...flow,
      stage: "ETAPA4_VEHICLE",
      vehicleModel: flow.savedVehicle,
      vehicleRaw: undefined,
      vehicleYear: undefined,
      vehicleColor: undefined,
      vehicleCondition: undefined,
      vehicleIsSuv: undefined,
      vehicleCollectStep: undefined,
      awaitingSavedVehicleChoice: true,
    };
    await saveFlow(msg.phone, next);
    await sendText({
      number: msg.phone,
      text: `Veículo salvo encontrado: *${flow.savedVehicle}*.

Deseja usar esse veículo novamente?
*1* — Sim
*2* — Não, informar outro veículo`,
    });
    return;
  }

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
    stage: serviceKey === "pacotes" ? "ETAPA3_PACKAGE_ACTION" : "ETAPA3_SERVICE_ACTION",
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

function dateLabel(date: Date, includeYear = false) {
  return format(date, includeYear ? "dd/MM/yyyy (EEEE)" : "dd/MM (EEEE)", { locale: ptBR });
}

function validBusinessDay(date: Date) {
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return date >= dayStart && date.getDay() !== 0;
}

function parseDayInput(input: string, num: number | null) {
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
  const firstTimeBonus = flow.firstTimeBonusApplied && flow.quoteDiscountMode === "base"
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
  if (hydratedFlow.savedVehicle !== flow.savedVehicle || hydratedFlow.loyaltyPoints !== flow.loyaltyPoints) {
    flow = hydratedFlow;
    await saveFlow(msg.phone, flow);
  } else {
    flow = hydratedFlow;
  }

  // DETECÇÃO DE CANCELAMENTO (cross-cutting) - usando core handler unificado
  // Rode antes do switch de etapas para interceptar intenções de cancelamento
  if (flow.awaitingDiscountResponse) {
    await executeCoreHandler(msg, flow, handleDiscountResponse, msg.phone);
    return;
  }

  if (await handleGlobalCommands(msg, flow, ctx, wctx, lower)) {
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
        text: `${aiAnswer}\n\n${aiFollowup(prompts)}`,
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
      // A opção 9 faz parte do menu oficial e não pode passar pelo limite das
      // categorias (1–8). Sem esse tratamento, o cliente via uma opção que
      // nunca acionava o atendimento humano.
      if (input === "9") {
        await handleHumanHandoffRequest(msg, flow);
        return;
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
              text: `${aiAnswer}\n\n${aiFollowup(prompts)}`,
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
            vehicleRaw: undefined,
            vehicleModel: undefined,
            vehicleYear: undefined,
            vehicleColor: undefined,
            vehicleCondition: undefined,
            vehicleIsSuv: undefined,
          };
          await saveFlow(msg.phone, nextFlow);
          await sendText({
            number: msg.phone,
            text: buildVehicleCollectionPrompt({
              model: null,
              year: null,
              color: null,
              condition: null,
            }),
          });
          return;
        }

        await sendText({
          number: msg.phone,
          text: `Para eu seguir com segurança, responda apenas *sim* ou *não* para confirmar os dados do veículo.`,
        });
        await sendText({
          number: msg.phone,
          text: etapa4VehicleConfirmation(
            flow.vehicleModel ?? "",
            flow.vehicleYear ?? "",
            flow.vehicleColor ?? "",
            flow.vehicleCondition ?? "",
            prompts
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
            text: vehicleColorRequest(`${model} ${year}`, prompts),
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
          text: vehicleColorRequest(`${flow.vehicleModel ?? ""} ${year}`.trim(), prompts),
        });
        return;
      }

      if (step === "color") {
        const color = input.trim();
        if (!color || color.length < 2) {
          await sendText({
            number: msg.phone,
            text: vehicleColorInvalid(prompts),
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
          text: vehicleConditionRequest(`${flow.vehicleModel ?? ""} ${flow.vehicleYear ?? ""} ${color}`.trim(), prompts),
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
            nextFlow.vehicleCondition ?? "",
            prompts
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
          const eligibleForBonus = await isFirstTimeCustomer(normalizePhone(msg.phone));

          if (eligibleForBonus) {
            flow.isFirstTimeCustomer = true;

            // Usar sistema de cupom como test-bot (mais robusto)
            const coupon = await findCouponByCode("PRIMEIRA10");
            if (coupon && coupon.active) {
              flow.firstTimeBonusCouponId = coupon.id;
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
              text: firstTimeBonusOffer(
                flow.customerName,
                flow.firstTimeBonusDiscount,
                calculateFlowTotal({ ...flow, firstTimeBonusApplied: true, quoteDiscountMode: "base" }),
                prompts
              ),
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
      if (num === 1) {
        flow.paymentMethod = "Cartão de débito";
        flow.stage = "ETAPA14_REMINDER";
        await saveFlow(msg.phone, flow);
        await sendText({
          number: msg.phone,
          text: reminderChoice(prompts),
        });
        return;
      }
      if (num === 2) {
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
          text: couponCodeRequest(wctx.prompts),
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

  if (!num || num < min || num > max) {
    const optionsText = isNoPix
      ? `*1* Cartão (na loja)\n*2* Dinheiro (na loja)`
      : `*1* PIX\n*2* Cartão (na loja)\n*3* Dinheiro (na loja)`;
    await sendText({
      number: msg.phone,
      text: invalidMenu(optionsText, prompts),
    });
    return;
  }

  const methodsNoPix = ["Cartão (na loja)", "Dinheiro (na loja)"];
  const methodsFull = ["PIX", "Cartão (na loja)", "Dinheiro (na loja)"];
  const methods = isNoPix ? methodsNoPix : methodsFull;
  flow.paymentMethod = methods[num - 1];

  if (flow.paymentMethod === "Cartão (na loja)" || flow.paymentMethod === "Dinheiro (na loja)") {
    flow.stage = "ETAPA14_REMINDER";
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: reminderChoice(prompts),
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
  if (!isNoPix && num === 1 && ctx.pixKey) {
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

async function confirmFinal(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  includePix = false
) {
  // O simulador percorre a mesma jornada sem gravar agenda, financeiro ou cupons.
  const result = msg.testMode?.skipDb
    ? { conflict: false }
    : await createAppointment(flow, msg.phone);
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
  };

  await delay(600);
  await sendText({
    number: msg.phone,
    text: `${confirmBody}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${flowMsg(wctx).mainMenu(menuFlow, msg.pushName)}`,
  });

  await saveFlow(msg.phone, menuFlow, msg.testMode?.skipDb);
}

/** Primeira interação: sempre etapa 1 */
export async function startFlow(msg: IncomingMessage) {
  console.log("[WhatsApp Flow] 🚀 Iniciando flow de boas-vindas");
  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();
  console.log("[WhatsApp Flow] 📤 Enviando mensagem de boas-vindas");
  await sendTextWrapper(msg, etapa1Welcome(ctx, wctx.prompts));
  console.log("[WhatsApp Flow] 💾 Salvando estado com welcomed=true");
  const initialState: FlowState = { stage: "ETAPA1_AWAITING_NAME", welcomed: true };
  await saveFlow(msg.phone, initialState, !!msg.testMode);
  msg.testMode?.onFlowStateChange?.(initialState);
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
