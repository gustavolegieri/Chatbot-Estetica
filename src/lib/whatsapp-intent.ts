import { AppointmentStatus } from "@prisma/client";
import { addDays, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import {
  calculateEndTime,
  formatDurationLabel,
  getAvailableSlots,
  parseTimeInput,
} from "./appointments";
import { normalizePhone } from "./utils";
import {
  BRAND_DEFAULT,
  CATALOG,
  CATEGORIES,
  UPSELL_BY_KEY,
  UNDECIDED_TO_KEY,
} from "./whatsapp-catalog";
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
  subMenuForCategory,
  wantsDoubt,
  wantsOtherServices,
  wantsToSchedule,
} from "./whatsapp-intent";
import { FlowState } from "./whatsapp-flow-types";
import {
  isValidVehicle,
  looksLikePersonName,
  parseModelFromText,
  parseVehicleMessage,
  parseYearFromText,
  vehicleDisplayFromFlow,
} from "./whatsapp-vehicle-parse";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Duração estimada (min) por serviço do catálogo — usada se o DB não tiver o serviço */
const CATALOG_DURATION_MIN: Record<string, number> = {
  lavagem_tecnica: 90,
  lavagem_detalhada: 150,
  polimento_comercial: 180,
  polimento_tecnico: 360,
  vitrificacao: 300,
  protecao_ceramica: 360,
  cristalizacao: 180,
  espelhamento: 240,
  higienizacao_interna: 240,
  hidratacao_couro: 120,
  revitalizacao_pintura: 420,
  descontaminacao: 120,
  limpeza_premium: 180,
  limpeza_motor: 120,
  restauracao_farois: 90,
  chuva_acida: 120,
  pacotes: 480,
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

function onlyNumber(input: string, max = 8): number | null {
  return onlyMenuNumber(input, max);
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

async function goToVehicleStep(msg: IncomingMessage, flow: FlowState) {
  const next = beginVehicleCollection(flow);
  await saveFlow(msg.phone, next);
  await sendText({ number: msg.phone, text: etapa4Vehicle(false) });
}

function quoteForKey(key: string, flow: FlowState) {
  const item = CATALOG[key];
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
  return { min, max, time: item.time, label: item.label };
}

async function activateService(msg: IncomingMessage, flow: FlowState, serviceKey: string) {
  const item = CATALOG[serviceKey];
  if (!item) return;
  const db =
    serviceKey === "pacotes"
      ? await resolveDbService("Detalhamento")
      : await resolveDbService(item.dbMatch);
  const stage =
    serviceKey === "pacotes" ? "ETAPA3_PACKAGE_ACTION" : "ETAPA3_SERVICE_ACTION";
  await saveFlow(msg.phone, {
    ...flow,
    serviceKey,
    serviceLabel: item.label,
    dbServiceId: db?.id,
    stage,
  });
  await delay(500);
  await sendText({ number: msg.phone, text: serviceDetail(item) });
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

async function getFlowDurationMin(flow: FlowState): Promise<number> {
  if (flow.dbServiceId) {
    const s = await prisma.service.findUnique({ where: { id: flow.dbServiceId } });
    if (s?.durationMin) return s.durationMin;
  }
  const key = flow.serviceKey ?? "lavagem_detalhada";
  return CATALOG_DURATION_MIN[key] ?? 120;
}

async function proceedToTimeSelection(msg: IncomingMessage, flow: FlowState) {
  let durationMin = await getFlowDurationMin(flow);
  if (flow.upsellAccepted) durationMin += 60;

  if (!flow.dayDate) return;

  const slots = await getAvailableSlots(flow.dayDate, durationMin);
  flow.serviceDurationMin = durationMin;
  flow.availableSlots = slots;

  if (slots.length === 0) {
    flow.stage = "ETAPA7_DAY";
    delete flow.availableSlots;
    await saveFlow(msg.phone, flow);
    await sendText({
      number: msg.phone,
      text: etapa7NoSlots(flow.dayLabel ?? "este dia"),
    });
    return;
  }

  flow.stage = "ETAPA7_TIME";
  await saveFlow(msg.phone, flow);
  await sendText({
    number: msg.phone,
    text: etapa7Time(flow.dayLabel ?? flow.dayDate, slots, formatDurationLabel(durationMin)),
  });
}

async function ensureClient(phone: string, name: string) {
  const normalized = normalizePhone(phone);
  let client = await prisma.client.findUnique({ where: { phone: normalized } });
  if (!client) {
    client = await prisma.client.create({ data: { name, phone: normalized } });
  } else if (client.name !== name) {
    client = await prisma.client.update({ where: { id: client.id }, data: { name } });
  }
  await prisma.whatsAppSession.update({
    where: { phone: normalized },
    data: { clientId: client.id },
  });
  return client;
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
    return `🛡️ Sim! Se algo não ficar como esperado, ajustamos para você.`;
  }
  if (/suv|pickup|van|grande|hilux|toro/.test(t)) {
    return `Sim! Trabalhamos com veículos de todos os portes 🚗`;
  }
  if (/sábado|sabado/.test(t)) {
    return `Atendemos aos sábados mediante agendamento.`;
  }
  return null;
}

async function sendQuote(msg: IncomingMessage, flow: FlowState) {
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
      : quoteForKey(key, flow);
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
      quotePitchForService(key)
    ),
  });
}

export async function processNumberedFlow(msg: IncomingMessage, flow: FlowState) {
  const ctx = await loadContext();
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
      text: `Claro 😊 ${menuForStage(flow)}`,
    });
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
        await activateService(msg, merged, serviceKey);
        return;
      }
    }
  }

  switch (flow.stage) {
    case "STALE_RETURN": {
      const name = flow.customerName ?? msg.pushName ?? "Cliente";
      if (looksLikePersonName(name) && name !== "Cliente") {
        await saveFlow(msg.phone, {
          stage: "ETAPA2_MAIN_MENU",
          welcomed: true,
          customerName: name.split(/\s+/)[0],
        });
        await sendText({ number: msg.phone, text: etapa2MainMenu(name.split(/\s+/)[0]) });
      } else {
        await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: false });
        await sendText({ number: msg.phone, text: etapa1Welcome(ctx) });
      }
      return;
    }

    case "ETAPA1_AWAITING_NAME": {
      const serviceKey = detectServiceKey(input);

      if (!looksLikePersonName(input)) {
        const hint = msg.pushName && looksLikePersonName(msg.pushName) ? msg.pushName.split(/\s+/)[0] : null;
        await sendText({
          number: msg.phone,
          text: hint
            ? `Para começar, me confirma seu *nome* 😊\n_(Se for *${hint}*, pode mandar só o nome)_`
            : `Para começar, qual é o seu *nome*? 😊\n_(Só o primeiro nome)_`,
        });
        return;
      }

      const name = input.split(/\s+/)[0];
      await ensureClient(msg.phone, name);
      const next: FlowState = {
        stage: "ETAPA2_MAIN_MENU",
        customerName: name,
        welcomed: true,
      };
      if (serviceKey && serviceKey !== "indeciso") {
        await saveFlow(msg.phone, next);
        await activateService(msg, next, serviceKey);
        return;
      }
      await saveFlow(msg.phone, next);
      await sendText({ number: msg.phone, text: etapa2MainMenu(name) });
      return;
    }

    case "ETAPA2_MAIN_MENU": {
      const catFromText = detectCategoryNum(input);
      const serviceFromText = detectServiceKey(input);
      const pick = num && num >= 1 && num <= 8 ? num : catFromText;

      if (serviceFromText && serviceFromText !== "indeciso") {
        await activateService(msg, flow, serviceFromText);
        return;
      }

      if (!pick) {
        if (isGreetingOrSmallTalk(input)) {
          await sendText({
            number: msg.phone,
            text: etapa2MainMenu(flow.customerName ?? "Cliente"),
          });
          return;
        }
        await sendText({
          number: msg.phone,
          text: invalidMenu(etapa2MainMenu(flow.customerName ?? "Cliente")),
        });
        return;
      }

      if (pick === 8) {
        await saveFlow(msg.phone, {
          ...beginVehicleCollection({ ...flow, serviceKey: "indeciso" }),
          stage: "ETAPA3_UNDECIDED_VEHICLE",
        });
        await sendText({ number: msg.phone, text: indecisiveVehiclePrompt() });
        return;
      }

      if (pick === 7) {
        await activateService(msg, flow, "pacotes");
        return;
      }

      const cat = CATEGORIES[pick];
      if (cat && cat.keys.length === 1) {
        await activateService(msg, flow, cat.keys[0]);
        return;
      }

      await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_SUB", categoryNum: pick });
      await sendText({ number: msg.phone, text: subMenuForCategory(pick) });
      return;
    }

    case "ETAPA2_SUB": {
      if (num === 0 || lower === "voltar" || lower === "menu") {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({
          number: msg.phone,
          text: etapa2MainMenu(flow.customerName ?? "Cliente"),
        });
        return;
      }
      const cat = flow.categoryNum ? CATEGORIES[flow.categoryNum] : null;
      if (!cat || !num || num < 1 || num > cat.keys.length) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(flow.categoryNum ? subMenuForCategory(flow.categoryNum) : etapa2MainMenu(flow.customerName ?? "Cliente")),
        });
        return;
      }
      const key = cat.keys[num - 1];
      await activateService(msg, flow, key);
      return;
    }

    case "ETAPA3_UNDECIDED_VEHICLE": {
      if (isValidVehicle(input)) {
        await saveFlow(msg.phone, {
          ...storeVehicle(flow, input),
          stage: "ETAPA3_UNDECIDED_PROBLEM",
        });
        await sendText({ number: msg.phone, text: indecisiveProblemPrompt() });
        return;
      }
      const step = flow.vehicleCollectStep ?? "model";
      if (step === "model") {
        const model = parseModelFromText(input);
        if (!model) {
          await sendText({ number: msg.phone, text: vehicleModelNotUnderstood() });
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
      const item = CATALOG[key];
      await saveFlow(msg.phone, {
        ...flow,
        stage: "ETAPA3_SERVICE_ACTION",
        serviceKey: key,
        serviceLabel: item.label,
        undecidedIssue: issue,
      });
      await sendText({
        number: msg.phone,
        text: `Para seu caso, recomendo *${item.label}* ✨\n\n${serviceDetail(item)}`,
      });
      return;
    }

    case "ETAPA3_PACKAGE_ACTION": {
      if (wantsOtherServices(input, num, 3)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: etapa2MainMenu(flow.customerName ?? "Cliente") });
        return;
      }
      if (num === 2) {
        await sendText({
          number: msg.phone,
          text: `📦 *Pacotes:* Brilho Total (R$550+) | Proteção Completa (R$900+) | Interior Premium (R$380+) | Full Detail (R$1400+)\n\n${packageActionMenu()}`,
        });
        return;
      }
      if (!wantsToSchedule(input, num)) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(packageActionMenu()),
        });
        return;
      }
      flow.packageKey = "Pacote escolhido";
      if (hasVehicleInFlow(flow)) {
        await sendQuote(msg, flow);
        return;
      }
      await goToVehicleStep(msg, flow);
      return;
    }

    case "ETAPA3_SERVICE_ACTION": {
      if (wantsOtherServices(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: etapa2MainMenu(flow.customerName ?? "Cliente") });
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
        await sendQuote(msg, flow);
        return;
      }
      await goToVehicleStep(msg, flow);
      return;
    }

    case "ETAPA4_VEHICLE": {
      if (isValidVehicle(input)) {
        await sendQuote(msg, storeVehicle(flow, input));
        return;
      }

      const step = flow.vehicleCollectStep ?? "model";

      if (step === "model") {
        const model = parseModelFromText(input);
        if (!model) {
          await sendText({ number: msg.phone, text: vehicleModelNotUnderstood() });
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
        await sendText({ number: msg.phone, text: vehicleNotUnderstood() });
        return;
      }
      await sendQuote(msg, storeVehicle(flow, combined));
      return;
    }

    case "ETAPA5_QUOTE": {
      if (wantsOtherServices(input, num)) {
        await saveFlow(msg.phone, { ...flow, stage: "ETAPA2_MAIN_MENU" });
        await sendText({ number: msg.phone, text: etapa2MainMenu(flow.customerName ?? "Cliente") });
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
        await sendText({ number: msg.phone, text: etapa7Day() });
        return;
      }
      const key = flow.serviceKey ?? "lavagem_detalhada";
      const upsell = UPSELL_BY_KEY[key] ?? UPSELL_BY_KEY.lavagem_detalhada;
      flow.upsellLabel = upsell.complement;
      flow.upsellOffered = true;
      flow.stage = "ETAPA6_UPSELL";
      await saveFlow(msg.phone, flow);
      await sendText({
        number: msg.phone,
        text: etapa6Upsell(flow.serviceLabel ?? "serviço", upsell.complement, upsell.benefit),
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
      await sendText({ number: msg.phone, text: etapa7Day() });
      return;
    }

    case "ETAPA7_PERIOD": {
      flow.stage = "ETAPA7_DAY";
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: etapa7Day() });
      return;
    }

    case "ETAPA7_DAY":
    case "ETAPA7_CUSTOM_DAY": {
      const dayParsed = parseDayInput(input, num);
      if (!dayParsed) {
        await sendText({
          number: msg.phone,
          text: invalidMenu(etapa7Day()),
        });
        return;
      }
      flow.dayLabel = dayParsed.dayLabel;
      flow.dayDate = dayParsed.dayDate;
      await proceedToTimeSelection(msg, flow);
      return;
    }

    case "ETAPA7_TIME": {
      const slots = flow.availableSlots ?? [];
      const durationMin = flow.serviceDurationMin ?? (await getFlowDurationMin(flow));
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
            etapa7Time(flow.dayLabel ?? flow.dayDate ?? "o dia", slots, formatDurationLabel(durationMin))
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
              formatDurationLabel(durationMin)
            )}`,
          });
          return;
        }
      }

      flow.startTime = chosen;
      flow.periodLabel = chosen;
      flow.stage = "ETAPA8_PAYMENT";
      await saveFlow(msg.phone, flow);
      await sendText({ number: msg.phone, text: etapa8Payment(!!ctx.pixKey) });
      return;
    }

    case "ETAPA8_PAYMENT":
    case "ETAPA8_PAYMENT_NO_PIX": {
      await handlePayment(msg, flow, ctx, num, lower);
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
            text: serviceDetail(CATALOG[restored.serviceKey]),
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
              restored.estimatedTime ?? "—"
            ),
          });
        }
        return;
      }
      const ans = faqAnswer(input, flow);
      await sendText({
        number: msg.phone,
        text: ans
          ? `${ans}\n\n_(Digite *voltar* ou continue perguntando)_`
          : `Entendi sua dúvida 😊 Nossa equipe pode detalhar isso na recepção.\n\n_(Digite *voltar* para seguir o agendamento)_`,
      });
      return;
    }

    default: {
      // Stage desconhecida ou corrompida → redireciona sem perder o nome do cliente
      console.warn("[Flow] Stage inesperada:", flow.stage, "— redirecionando para menu principal");
      const name = flow.customerName ?? "Cliente";
      await saveFlow(msg.phone, {
        stage: "ETAPA2_MAIN_MENU",
        welcomed: true,
        customerName: flow.customerName,
      });
      await sendText({ number: msg.phone, text: etapa2MainMenu(name) });
    }
  }
}

function menuForStage(flow: FlowState): string {
  switch (flow.stage) {
    case "ETAPA2_MAIN_MENU":
      return etapa2MainMenu(flow.customerName ?? "Cliente");
    case "ETAPA5_QUOTE":
      return `*1* Agendar | *2* Outro serviço | *3* Dúvida`;
    case "ETAPA3_SERVICE_ACTION":
      return serviceActionMenu();
    default:
      return `Digite *menu* para ver opções.`;
  }
}

async function handlePayment(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  num: number | null,
  lower: string
) {
  const isNoPix = flow.stage === "ETAPA8_PAYMENT_NO_PIX";
  const max = isNoPix ? 3 : 4;
  const min = isNoPix ? 1 : 1;

  if (!num || num < min || num > max) {
    await sendText({
      number: msg.phone,
      text: invalidMenu(etapa8Payment(!!ctx.pixKey && !isNoPix)),
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
    await sendText({ number: msg.phone, text: etapa8Payment(false) });
    return;
  }

  await confirmFinal(msg, flow, ctx, !isNoPix && num === 1 && !!ctx.pixKey);
}

async function confirmFinal(
  msg: IncomingMessage,
  flow: FlowState,
  ctx: FlowContext,
  includePix = false
) {
  await createAppointment(flow, msg.phone);

  const services = [
    flow.serviceLabel,
    flow.upsellAccepted ? flow.upsellLabel : null,
    flow.packageKey,
  ]
    .filter(Boolean)
    .join(" + ");

  const value =
    flow.quoteMin && flow.quoteMax
      ? `R$ ${flow.quoteMin} a R$ ${flow.quoteMax}`
      : "sob consulta";

  const name = flow.customerName ?? "Cliente";
  const confirmBody = etapa9Confirm({
    name,
    vehicle: vehicleDisplayFromFlow(flow),
    services: services || "Serviço premium",
    day: flow.dayLabel ?? flow.dayDate ?? "—",
    time: flow.startTime ?? flow.periodLabel ?? "—",
    payment: flow.paymentMethod ?? "—",
    value,
    address: ctx.address || "nosso endereço",
    pixBlock: includePix ? etapa8PixBlock(ctx) : undefined,
  });

  await delay(600);
  await sendText({
    number: msg.phone,
    text: `${confirmBody}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${etapa2MainMenu(name)}`,
  });

  await saveFlow(msg.phone, {
    stage: "ETAPA2_MAIN_MENU",
    customerName: flow.customerName,
    welcomed: true,
  });
}

/** Primeira interação: sempre etapa 1 */
export async function startFlow(msg: IncomingMessage) {
  const ctx = await loadContext();
  await saveFlow(msg.phone, { stage: "ETAPA1_AWAITING_NAME", welcomed: true });
  await sendText({ number: msg.phone, text: etapa1Welcome(ctx) });
}

export async function goToMainMenu(phone: string, customerName: string) {
  const ctx = await loadContext();
  await saveFlow(phone, {
    stage: "ETAPA2_MAIN_MENU",
    welcomed: true,
    customerName,
  });
  await sendText({ number: phone, text: etapa2MainMenu(customerName) });
}