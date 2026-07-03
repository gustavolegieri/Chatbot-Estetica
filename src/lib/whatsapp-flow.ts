import { AppointmentStatus } from "@prisma/client";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { sendText, sendMedia } from "./evolution-api";
import {
  calculateEndTime,
  formatDurationLabel,
  getAvailableSlots,
  parseTimeInput,
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
import {
  etapa1Welcome,
  etapa2MainMenu,
  etapa4AskYear,
  etapa4Vehicle,
  etapa5Quote,
  etapa6Upsell,
  etapa7Day,
  etapa7NoSlots,
  etapa7Time,
  etapa8Payment,
  etapa8PixBlock,
  etapa9Confirm,
  formatHours,
  indecisiveProblemPrompt,
  indecisiveVehiclePrompt,
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
  analyzeWhatsAppMessage,
  answerCustomerDoubt,
  looksLikeQuestion,
} from "./whatsapp-ai";
import { canRedeem, findCouponByCode, redeemCoupon } from "./coupons";


const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  lavagem_simples: 75,
  lavagem_completa: 105,
  lavagem_detalhada: 150,
  limpeza_motor: 120,
  cristalizacao_farois: 90,
  descontaminacao_pintura: 150,
  higienizacao_tecido: 150,
  higienizacao_tecido_completa: 210,
  higienizacao_couro: 120,
  higienizacao_couro_completa: 210,
  descontaminacao_vidro: 90,
  polimento_cotacao: 240,
};

interface IncomingMessage {
  phone: string;
  text: string;
  pushName?: string;
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
  return {
    ...flow,
    vehicleRaw: p.summary,
    vehicleModel: p.model || flow.vehicleModel,
    vehicleYear: p.year || flow.vehicleYear,
    vehicleColor: p.color,
    vehicleCondition: p.condition,
    vehicleIsSuv: p.isSuv,
    vehicleCollectStep: undefined,
  };
}

function hasVehicleInFlow(flow: FlowState) {
  if (flow.vehicleModel && flow.vehicleYear) return true;
  if (flow.vehicleRaw && isValidVehicle(flow.vehicleRaw)) return true;
  return false;
}

function beginVehicleCollection(flow: FlowState): FlowState {
  return {
    ...flow,
    stage: "ETAPA4_VEHICLE",
    vehicleCollectStep: "model",
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

function quoteForKey(key: string, flow: FlowState, wctx: WhatsAppCatalogContext) {
  const item = wctx.catalog[key];
  if (!item || key === "indeciso") {
    return { min: 0, max: 0, time: "—", label: flow.serviceLabel ?? "Serviço" };
  }
  const vehicleText = vehicleDisplayFromFlow(flow);
  const suv = flow.vehicleIsSuv ?? isSuvLike(vehicleText);
  const bad =
    isBadCondition(vehicleText) ||
    flow.vehicleCondition === "precisa de atenção";
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
  const dbId =
    wctx.dbServiceIdByKey[serviceKey] ?? (await resolveDbService(item.dbMatch))?.id;
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
    return {
      dayDate,
      dayLabel: format(parse(dayDate, "yyyy-MM-dd", new Date()), "dd/MM/yyyy (EEEE)", {
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
  const t = text.toLowerCase();
  return /muito|risco|oxida|sujo|mancha|opac|ruim|arranh/i.test(t);
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
  };
}

async function saveFlow(phone: string, flow: FlowState) {
  await prisma.whatsAppSession.update({
    where: { phone: normalizePhone(phone) },
    data: { metadata: flow as object },
  });
}

async function resolveDbService(dbMatch: string) {
  return prisma.service.findFirst({
    where: { active: true, name: { contains: dbMatch, mode: "insensitive" } },
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

  const slots = await getAvailableSlots(flow.dayDate, durationMin);
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

async function ensureClient(phone: string, name: string) {
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
  if (!client || !flow.dbServiceId || !flow.dayDate || !flow.startTime) return null;




  const service = await prisma.service.findUnique({ where: { id: flow.dbServiceId } });
  if (!service) return null;

  const durationMin = flow.serviceDurationMin ?? service.durationMin;

  const appointment = await prisma.appointment.create({
    data: {
      clientId: client.id,
      serviceId: service.id,
      date: parse(flow.dayDate, "yyyy-MM-dd", new Date()),
      startTime: flow.startTime,
      endTime: calculateEndTime(flow.startTime, durationMin),
      status: AppointmentStatus.CONFIRMED,
      source: "whatsapp",
      clientConfirmedAt: null,
      notes: [
        flow.vehicleRaw,
        flow.paymentMethod,
        flow.upsellLabel ? `Upsell: ${flow.upsellLabel}` : null,
        flow.packageKey,
      ]
        .filter(Boolean)
        .join(" | "),
    },
  });

  await prisma.financialRecord.create({
    data: {
      type: "INCOME",
      category: "SERVICE",
      amount: flow.quoteMin ?? service.price,
      description: `WhatsApp - ${flow.serviceLabel}`,
      appointmentId: appointment.id,
      serviceId: service.id,
    },
  });

  return appointment;
}

function faqAnswer(text: string, flow: FlowState): string | null {
  const t = text.toLowerCase();
  if (/quanto tempo|demora|duração|duracao/.test(t)) {
    return `⏱️ O tempo varia conforme o estado do veículo e o serviço. Estimativa: *${flow.estimatedTime ?? "na avaliação"}*.`;
  }
  if (/deixar o carro|ficar|buscar/.test(t)) {
    return `Sim 😊 Muitos clientes deixam o veículo e retiram após o serviço.`;
  }
  if (/garantia/.test(t)) {
    return `🛡️ Sim! Se algo não ficou como esperado, ajustamos para você.`;
  }
  if (/suv|pickup|van|grande|hilux|toro/.test(t)) {
    return `Sim! Trabalhamos com veículos de todos os portes 🚗`;
  }
  if (/sábado|sabado/.test(t)) {
    return `Atendemos aos sábados mediante agendamento.`;
  }
  return null;
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
        await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: false });
        await sendText({ number: msg.phone, text: etapa1Welcome(ctx, prompts) });
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

      if (analysis?.intent === "greeting" || analysis?.intent === "small_talk") {
        const hint =
          msg.pushName && looksLikePersonName(msg.pushName) ? msg.pushName.split(/\s+/)[0] : null;
        await sendText({
          number: msg.phone,
          text:
            analysis.reply ??
            (hint
              ? `Olá! 😊 Para começar, me confirma seu *nome*?\n_(Se for *${hint}*, pode mandar só o nome)_`
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

      const nameFromAi =
        analysis?.intent === "name" && analysis.extractedName
          ? analysis.extractedName.split(/\s+/)[0]
          : null;
      const nameFromInput = looksLikePersonName(input) ? input.split(/\s+/)[0] : null;
      const name = nameFromAi ?? nameFromInput;

      if (!name) {
        const hint =
          msg.pushName && looksLikePersonName(msg.pushName) ? msg.pushName.split(/\s+/)[0] : null;
        await sendText({
          number: msg.phone,
          text: hint
            ? `Para começar, me confirma seu *nome* 😊\n_(Se for *${hint}*, pode mandar só o nome)_`
            : `Para começar, qual é o seu *nome*? 😊\n_(Só o primeiro nome)_`,
        });
        return;
      }

      await ensureClient(msg.phone, name);
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
          vehicleCollectStep: "year",
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
      if (wantsOtherServices(input, num, 3)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: msgH.mainMenu(flow, msg.pushName) });
        return;
      }
      if (num === 2) {
        await sendText({
          number: msg.phone,
          text: `📦 *Pacotes:* Brilho Total (R$550+) | Proteção Completa (R$900+) | Interior Premium (R$380+) | Full Detail (R$1400+)\n\n${packageActionMenu(prompts)}`,
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
      if (wantsOtherServices(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: msgH.mainMenu(flow, msg.pushName) });
        return;
      }
      if (wantsDoubt(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA10_FAQ", returnStage: "ETAPA3_SERVICE_ACTION" });
        await sendText({
          number: msg.phone,
          text: `Pode perguntar 😊 Ex: tempo do serviço, garantia, deixar o carro.\n\nDigite *voltar* para retornar.`,
        });
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
      if (isValidVehicle(input)) {
        await sendQuote(msg, storeVehicle(flow, input), wctx);
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
          vehicleCollectStep: "year",
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
      if (!isValidVehicle(combined)) {
        await sendText({ number: msg.phone, text: vehicleNotUnderstood(prompts) });
        return;
      }
      await sendQuote(msg, storeVehicle(flow, combined), wctx);
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
      if (flow.upsellOffered) {
        flow.stage = "ETAPA7_DAY";
        await saveFlow(msg.phone, flow);
        await sendText({ number: msg.phone, text: etapa7Day(prompts) });
        return;
      }
      const key = flow.serviceKey ?? "lavagem_detalhada";
      const upsell = getUpsellForKey(key, wctx) ?? getUpsellForKey("lavagem_detalhada", wctx);
      if (!upsell) {
        flow.stage = "ETAPA7_DAY";
        await saveFlow(msg.phone, flow);
        await sendText({ number: msg.phone, text: etapa7Day(prompts) });
        return;
      }
      flow.upsellLabel = upsell.complement;
      flow.upsellOffered = true;
      flow.stage = "ETAPA6_UPSELL";
      await saveFlow(msg.phone, flow);
      await sendText({
        number: msg.phone,
        text: etapa6Upsell(flow.serviceLabel ?? "serviço", upsell.complement, upsell.benefit, prompts),
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
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: etapa7Day(prompts) });
      return;
    }

    case "ETAPA7_PERIOD": {
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: etapa7Day(prompts) });
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
      let chosen: string | null = null;

      if (num && num >= 1 && num <= slots.length) {
        chosen = slots[num - 1];
      } else {
        const typed = parseTimeInput(input);
        if (typed && slots.includes(typed)) chosen = typed;
      }

      if (!chosen) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(
            etapa7Time(flow.dayLabel ?? flow.dayDate ?? "o dia", slots, formatDurationLabel(durationMin), prompts)
          ),
        });
        return;
      }

      if (flow.dayDate) {
        const fresh = await getAvailableSlots(flow.dayDate, durationMin);
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
      flow.stage = "ETAPA8_PAYMENT";
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: etapa8Payment(!!ctx.pixKey, prompts) });
      return;
    }

    case "ETAPA8_PAYMENT": {
      // Antes de escolher a forma de pagamento, permitir aplicar cupom
      if (await applyCouponPhase(msg, flow, lower, ctx, wctx, num, input)) return;
      await handlePayment(msg, flow, ctx, num, lower, wctx);
      return;
    }

    case "ETAPA8_PAYMENT_NO_PIX": {
      // Antes de escolher a forma de pagamento, permitir aplicar cupom
      if (await applyCouponPhase(msg, flow, lower, ctx, wctx, num, input)) return;
      await handlePayment(msg, flow, ctx, num, lower, wctx);
      return;
    }


    case "ETAPA10_FAQ": {
      if (lower === "voltar" && flow.returnStage) {
        const restored: FlowState = { ...flow, stage: flow.returnStage };
        delete restored.returnStage;
        await saveFlow(msg.phone, restored);
        if (restored.stage === "ETAPA3_SERVICE_ACTION" && restored.serviceKey) {
          await sendText({
            number: msg.phone,
            text: flowMsg(wctx).detail(restored.serviceKey),
          });
        } else {
          await sendText({
            number: msg.phone,
            text: etapa5Quote(
              restored.customerName ?? "Cliente",
              restored.vehicleRaw ?? "seu veículo",
              restored.serviceLabel ?? "serviço",
              restored.quoteMin ?? 0,
              restored.quoteMax ?? 0,
              restored.estimatedTime ?? "—",
              undefined,
              prompts
            ),
          });
        }
        return;
      }
      const ans =
        (await answerCustomerDoubt({ question: input, flow, ctx, wctx })) ?? faqAnswer(input, flow);
      await sendText({
        number: msg.phone,
        text: ans
          ? `${ans}\n\n_(Digite *voltar* ou continue perguntando)_`
          : `Entendi sua dúvida 😊 Nossa equipe pode detalhar isso na recepção.\n\n_(Digite *voltar* para seguir o agendamento)_`,
      });
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

  const discountText = applied.discountApplied > 0 ? `Desconto: *R$ ${applied.discountApplied}*` : `Cupom aplicado!`;
  await sendText({
    number: msg.phone,
    text: `✅ Cupom *${code.toUpperCase()}* aplicado!

${discountText}

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
  const max = isNoPix ? 3 : 4;
  const min = isNoPix ? 1 : 1;

  if (!num || num < min || num > max) {
    await sendText({
      number: msg.phone,
      text: invalidMenu(etapa8Payment(!!ctx.pixKey && !isNoPix, prompts), prompts),
    });
    return;
  }

  const methodsNoPix = ["Cartão de débito", "Cartão de crédito", "Dinheiro"];
  const methodsFull = ["PIX", "Cartão de débito", "Cartão de crédito", "Dinheiro"];
  const methods = isNoPix ? methodsNoPix : methodsFull;
  flow.paymentMethod = methods[num - 1];

  if (!isNoPix && num === 1 && !ctx.pixKey) {
    flow.stage = "ETAPA8_PAYMENT_NO_PIX";
    await saveFlow(msg.phone, flow);
    await sendText({ number: msg.phone, text: etapa8Payment(false, prompts) });
    return;
  }

  await confirmFinal(msg, flow, ctx, wctx, !isNoPix && num === 1 && !!ctx.pixKey);
}

async function confirmFinal(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  wctx: WhatsAppCatalogContext,
  includePix = false
) {
  const appointment = await createAppointment(flow, msg.phone);

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

  const value =
    flow.quoteMin && flow.quoteMax && flow.quoteMin > 0
      ? flow.quoteMin === flow.quoteMax
        ? `R$ ${flow.quoteMin}`
        : `R$ ${flow.quoteMin} a R$ ${flow.quoteMax}`
      : "sob consulta";

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
      value,
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
  const ctx = await loadContext();
  const wctx = await loadWhatsAppCatalog();
  await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: true });
  await sendText({ number: msg.phone, text: etapa1Welcome(ctx, wctx.prompts) });
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