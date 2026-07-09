import test from "node:test";
import assert from "node:assert/strict";
import { processTestFlow, buildBudgetSummaryText } from "./test-bot-processor";
import { isValidCustomerName, buildCalendarPrompt } from "./flow-validation";

test("transcript completo valida fluxo alinhado ao WhatsApp flow", async () => {
  (globalThis as any).__BB_USE_PROMPT_FALLBACK__ = true;

  (globalThis as any).__BB_PRISMA_MOCK__ = {
    service: {
      findFirst: async () => ({
        active: true,
        id: "svc1",
        catalogKey: "lavagem_simples",
        name: "Lavagem Simples",
        label: "Lavagem Simples",
        priceSuvMin: 0,
        priceHatchMin: 0,
        upsellServiceId: null,
        durationMin: 90,
        media: [],
      }),
      findUnique: async () => null,
    },
    coupon: {
      findUnique: async () => null,
    },
  };

  (globalThis as any).__BB_WCTX_MOCK__ = {
    categories: {
      1: { title: "💧 Lavagem", keys: ["lavagem_simples"] },
      2: { title: "✨ Polimento", keys: ["polimento_cotacao"] },
      8: { title: "🤔 Ajuda na escolha", keys: ["indeciso"] },
    },
    catalog: {
      lavagem_simples: {
        key: "lavagem_simples",
        label: "Lavagem Simples",
        short: "",
        pitch: "",
        time: "1h",
        hatchMin: 75,
        hatchMax: 75,
        suvMin: 75,
        suvMax: 75,
        dbMatch: "Lavagem Simples",
        upsell: null,
      },
    },
    servicesByKey: {
      lavagem_simples: {
        key: "lavagem_simples",
      },
    },
    prompts: undefined,
    dbServiceIdByKey: {
      lavagem_simples: null,
    },
  };

  const session: any = {
    stage: "ETAPA1_AWAITING_NAME",
    welcomed: true,
    customerName: null,
    selectedService: null,
    selectedSubService: null,
    selectedServiceName: null,
    couponCode: null,
    couponDiscount: null,
    vehiclePhotoAttached: undefined,
    vehicle: { model: null, year: null, color: null, condition: "normal" },
    quote: null,
    upsellOffer: null,
    selectedDay: null,
    selectedTime: null,
    paymentMethod: null,
    wantsReminder: null,
    upsellAccepted: false,
    upsellLabel: null,
    upsellValue: null,
  };

  let res = await processTestFlow({ sessionId: "s1", message: "Gustavo", session });
  assert.equal(session.customerName, "Gustavo");
  assert.equal(session.stage, "ETAPA2_MAIN_MENU");

  const polimentoSession = { ...session, customerName: "Gustavo", stage: "ETAPA2_MAIN_MENU" };
  res = await processTestFlow({ sessionId: "s2", message: "2", session: polimentoSession });
  assert.equal(polimentoSession.stage, "ETAPA2_SUB", "Categoria 2 deve abrir submenu de polimento");
  assert.equal(polimentoSession.selectedService, "polimento", "Categoria 2 deve mapear para polimento");

  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA2_SUB");

  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA3_SERVICE_ACTION");

  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA4_VEHICLE");

  res = await processTestFlow({ sessionId: "s1", message: "Honda Civic 2020, preto, bom estado", session });
  assert.equal(session.stage, "ETAPA4_VEHICLE");
  assert.equal(session.vehicle.model, "Honda Civic");

  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  assert.equal(session.stage, "ETAPA5_QUOTE");

  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  assert.equal(session.stage, "ETAPA6_UPSELL");

  res = await processTestFlow({ sessionId: "s1", message: "2", session });
  assert.equal(session.stage, "ETAPA7_DAY");

  res = await processTestFlow({ sessionId: "s1", message: "hoje", session });
  assert.equal(session.stage, "ETAPA7_TIME");

  res = await processTestFlow({ sessionId: "s1", message: "2", session });
  assert.equal(session.stage, "ETAPA8_PAYMENT");

  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA9_REMINDER");

  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA10_CONFIRM");

  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  assert.equal(session.stage, "ETAPA11_RATING");
  assert.match(res[0].text, /Tudo certo/i);
});

test("isValidCustomerName - validação de nome unitária", () => {
  // Deve rejeitar
  assert.equal(isValidCustomerName(null), false);
  assert.equal(isValidCustomerName(undefined), false);
  assert.equal(isValidCustomerName(""), false);
  assert.equal(isValidCustomerName(" "), false);
  assert.equal(isValidCustomerName("123"), false, "números puros");
  assert.equal(isValidCustomerName("ffds"), false, "sem vogais");
  assert.equal(isValidCustomerName("asdf"), false, "sem vogais");
  assert.equal(isValidCustomerName("aaaa"), false, "caractere repetido");
  assert.equal(isValidCustomerName("a"), false, "menos de 2 caracteres");
  assert.equal(isValidCustomerName("sim"), false, "palavra reservada");
  assert.equal(isValidCustomerName("menu"), false, "palavra reservada");
  assert.equal(isValidCustomerName("test"), false, "palavra reservada");

  // Deve aceitar
  assert.equal(isValidCustomerName("Gustavo"), true);
  assert.equal(isValidCustomerName("Ana"), true);
  assert.equal(isValidCustomerName("João"), true);
  assert.equal(isValidCustomerName("Maria Souza"), true);
  assert.equal(isValidCustomerName("José"), true);
});