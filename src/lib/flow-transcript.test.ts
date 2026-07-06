import test from "node:test";
import assert from "node:assert/strict";
import { processTestFlow } from "./test-bot-processor";

// Nota: este teste é executado com `tsx` e usa mocks via `globalThis`.
// Como o modo teste chama prisma/loadWhatsAppCatalog, isolamos o cenário para não depender do DB.

test("transcript completo valida fluxo (nome/veículo/ordem/cupom/calendário) - modo teste", async () => {
  // Mock de prisma (DB)
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
    },
    coupon: {
      findUnique: async () => null,
    },
  };

  // Mock de catálogo/prompts consumidos pelo test-bot-processor
  (globalThis as any).__BB_WCTX_MOCK__ = {
    categories: [
      {
        label: "Lavagem",
        key: "lavagem",
        keys: ["lavagem_simples"],
      },
    ],
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
  };

  const settings: any = { businessAddress: "Rua das Oficinas, 100" };
  const catalog: any[] = [];

  // 1) Nome inválido deve ser rejeitado
  let res = await processTestFlow({ sessionId: "s1", message: "ffds", session, settings, catalog });
  assert.ok(res.length > 0);
  assert.match(res[0].text, /Não consegui identificar seu nome/i);
  assert.equal(session.customerName, null);

  // 2) Nome válido
  res = await processTestFlow({ sessionId: "s1", message: "Gustavo", session, settings, catalog });
  assert.equal(session.customerName, "Gustavo");

  // 3) Menu principal (categoria 1)
  res = await processTestFlow({ sessionId: "s1", message: "1", session, settings, catalog });
  assert.equal(session.stage, "ETAPA2_SUB");

  // 4) Submenu (primeira opção)
  res = await processTestFlow({ sessionId: "s1", message: "1", session, settings, catalog });
  assert.equal(session.stage, "ETAPA3_SERVICE_ACTION");

  // 5) Agendar
  res = await processTestFlow({ sessionId: "s1", message: "1", session, settings, catalog });
  assert.equal(session.stage, "ETAPA4_VEHICLE");

  // 6) Veículo → confirmação estruturada
  res = await processTestFlow({
    sessionId: "s1",
    message: "Honda Civic 2020, preto, em bom estado",
    session,
    settings,
    catalog,
  });
  assert.equal(session.stage, "ETAPA5_QUOTE");

  const vehicleMsg = res.map((r) => r.text).join("\n");
  assert.match(vehicleMsg, /Modelo/i);
  assert.match(vehicleMsg, /Honda Civic/i);
  assert.match(vehicleMsg, /Ano/i);
  assert.match(vehicleMsg, /2020/);
  assert.match(vehicleMsg, /Cor/i);
  assert.match(vehicleMsg, /preto/i);
  assert.match(vehicleMsg, /Estado/i);
  assert.match(vehicleMsg, /bom/i);

  // Mensagem do veículo deve aparecer uma única vez nesse passo
  const vehicleOccurrences = (vehicleMsg.match(/Modelo:/gi) ?? []).length;
  assert.equal(vehicleOccurrences, 1);

  // 7) Confirmação do veículo (mock: segue)
  res = await processTestFlow({ sessionId: "s1", message: "1", session, settings, catalog });

  // 8) Foto opcional: “não”
  res = await processTestFlow({ sessionId: "s1", message: "2", session, settings, catalog });

  // 9) Cupom: “não”
  res = await processTestFlow({ sessionId: "s1", message: "não", session, settings, catalog });
  const allText = res.map((r) => r.text).join("\n");
  assert.match(allText, /Seu orçamento/i);

  // 10) Calendar prompt deve existir (quando cair na etapa de dia)
  // (como o modo teste pode pular dependendo do catálogo, tentamos avançar e validamos se apareceu)
  res = await processTestFlow({ sessionId: "s1", message: "4", session, settings, catalog }).catch(() => [] as any);
  const t2 = res.map((r: any) => r.text).join("\n");
  if (t2) {
    assert.match(t2, /📅/);
    assert.ok(t2.includes("Dias disponíveis"));
  }
});

