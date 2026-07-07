import test from "node:test";
import assert from "node:assert/strict";
import { processTestFlow, buildBudgetSummaryText } from "./test-bot-processor";
import { isValidCustomerName, buildCalendarPrompt } from "./flow-validation";

test("transcript completo valida fluxo (nome/veículo/ordem/cupom/calendário) - modo teste", async () => {
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

  // ─────────────────────────────────────────────────────────
  // TESTE 1: VALIDAÇÃO DE NOME
  // ─────────────────────────────────────────────────────────

  // 1a) Nome inválido "ffds" (sem vogais) deve ser rejeitado
  assert.equal(isValidCustomerName("ffds"), false, '"ffds" não é um nome válido');

  let res = await processTestFlow({ sessionId: "s1", message: "ffds", session });
  assert.ok(res.length > 0, "Deve ter resposta para nome inválido");
  assert.match(res[0].text, /Não consegui identificar seu nome/i, "Deve rejeitar 'ffds'");
  assert.equal(session.customerName, null, "Nome não deve ser salvo");

  // 1b) Nome válido "Gustavo" deve ser aceito
  assert.equal(isValidCustomerName("Gustavo"), true);

  // 2) Nome válido → avança para ETAPA2_MAIN_MENU
  res = await processTestFlow({ sessionId: "s1", message: "Gustavo", session });
  assert.equal(session.customerName, "Gustavo", "Nome deve ser Gustavo");
  assert.equal(session.stage, "ETAPA2_MAIN_MENU", "Deve avançar para menu principal");
  const menuText = res.map((r) => r.text).join("\n");
  assert.ok(menuText.includes("Gustavo"), "Deve mostrar o nome Gustavo");
  assert.ok(menuText.includes("carro"), "Deve perguntar sobre carro");

  // ─────────────────────────────────────────────────────────
  // TESTE 2: MENU PRINCIPAL → SUBMENU → SERVIÇO
  // ─────────────────────────────────────────────────────────

  // 3) Menu principal (categoria 1 — lavagem)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA2_SUB", "Deve ir para submenu");
  assert.equal(session.selectedService, "lavagem");

  // 4) Submenu (primeira opção — lavagem_simples)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA3_SERVICE_ACTION", "Deve ir para action");
  assert.equal(session.selectedSubService, "lavagem_simples");
  assert.equal(session.selectedServiceName, "Lavagem Simples");

  // 5) Agendar (opção 1)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA4_VEHICLE", "Deve ir para coleta de veículo");

  // ─────────────────────────────────────────────────────────
  // TESTE 3: VEÍCULO — PARSING E CONFIRMAÇÃO SEM CAMPOS VAZIOS
  // ─────────────────────────────────────────────────────────

  // 6) Enviar dados do veículo
  res = await processTestFlow({
    sessionId: "s1",
    message: "Honda Civic 2020, preto, em bom estado",
    session,
  });
  // Deve ir para ETAPA4_VEHICLE_CONFIRM (nova etapa de confirmação)
  assert.equal(session.stage, "ETAPA4_VEHICLE_CONFIRM", "Deve ir para confirmação de veículo");

  const vehicleMsg = res.map((r) => r.text).join("\n");
  // Verificar que a mensagem contém TODOS os campos do veículo formatados
  assert.match(vehicleMsg, /Modelo/i, "Deve conter Modelo");
  assert.match(vehicleMsg, /Honda Civic/i, "Deve conter Honda Civic");
  assert.match(vehicleMsg, /Ano/, "Deve conter Ano");
  assert.match(vehicleMsg, /2020/, "Deve conter 2020");
  assert.match(vehicleMsg, /Cor/, "Deve conter Cor");
  assert.match(vehicleMsg, /preto/i, "Deve conter cor preto");
  assert.match(vehicleMsg, /Estado/, "Deve conter Estado");
  assert.match(vehicleMsg, /bom/i, "Deve conter bom estado");

  // Verificar que a mensagem do veículo aparece EXATAMENTE UMA VEZ
  const vehicleOccurrences = (vehicleMsg.match(/Modelo:/gi) ?? []).length;
  assert.equal(vehicleOccurrences, 1, "Veículo deve aparecer uma única vez");

  // Não deve ter vírgulas soltas ou campos vazios
  assert.doesNotMatch(vehicleMsg, /, ,/, "Não deve ter vírgulas soltas");
  assert.doesNotMatch(vehicleMsg, /—,/, "Não deve ter travessão com vírgula");

  // 7) Confirmar veículo (sim) → vai para upsell
  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  assert.equal(session.stage, "ETAPA6_UPSELL", "Após confirmar veículo, deve ir para upsell");
  assert.ok(session.quote !== null && session.quote > 0, "Preço base deve ser calculado");

  // 7b) Recusar upsell (opção 2)
  res = await processTestFlow({ sessionId: "s1", message: "2", session });
  assert.equal(session.stage, "ETAPA8_PHOTO", "Deve ir para foto após recusar upsell");

  // ─────────────────────────────────────────────────────────
  // TESTE 4: FOTO (OPCIONAL) — NÃO
  // ─────────────────────────────────────────────────────────

  // 8) Foto opcional: "não" (opção 2)
  res = await processTestFlow({ sessionId: "s1", message: "2", session });
  assert.equal(session.stage, "ETAPA9_COUPON", "Deve ir para cupom");
  assert.equal(session.vehiclePhotoAttached, false);

  // ─────────────────────────────────────────────────────────
  // TESTE 5: CUPOM → ORÇAMENTO DISCRIMINADO
  // ─────────────────────────────────────────────────────────

  // 9) Cupom: "não"
  res = await processTestFlow({ sessionId: "s1", message: "não", session });
  const allText = res.map((r) => r.text).join("\n");

  // O orçamento só deve aparecer AGORA (após cupom), não antes
  assert.match(allText, /Seu orçamento/i, "Orçamento deve aparecer depois do cupom");
  assert.match(allText, /━+/, "Orçamento deve ter divisores");
  assert.match(allText, /Total:/i, "Orçamento deve ter total");

  // Orçamento discriminado: deve ter serviço, complemento e desconto (mesmo que zero)
  assert.match(allText, /Serviço:/i, "Orçamento deve mostrar Serviço");
  assert.match(allText, /R\$/, "Orçamento deve mostrar valores em R$");

  // Verificar que a mensagem de veículo NÃO aparece de novo no orçamento
  const vehicleLines = (allText.match(/Modelo:/gi) ?? []).length;
  assert.equal(vehicleLines, 0, "Veículo não deve aparecer de novo no orçamento");

  // ─────────────────────────────────────────────────────────
  // TESTE 6: PROSSEGUIR → LOGÍSTICA → CALENDÁRIO VISUAL
  // ─────────────────────────────────────────────────────────

  // 10) Prosseguir com agendamento (sim)
  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  assert.equal(session.stage, "ETAPA10_LOGISTICS", "Deve ir para logística");
  assert.match(res[0].text, /🚚/, "Deve perguntar sobre busca/entrega");

  // 10b) Escolher "Buscar na loja" (opção 1)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA7_DAY", "Deve ir para data após logística");
  const dateText = res.map((r) => r.text).join("\n");

  // Deve mostrar calendário VISUAL, não lista numérica
  assert.match(dateText, /📅/, "Deve ter emoji de calendário");
  assert.ok(
    dateText.includes("Dias disponíveis") || dateText.includes("Dom") || dateText.includes("Seg"),
    "Deve mostrar calendário visual com dias da semana"
  );
  assert.doesNotMatch(dateText, /Hoje.*Amanhã.*Em 2 dias/, "Não deve ser lista numérica");

  // 11) Escolher dia pelo número (ex: 8)
  res = await processTestFlow({ sessionId: "s1", message: "8", session });
  assert.equal(session.stage, "ETAPA7_TIME", "Deve ir para horário");
  assert.ok(session.selectedDay, "Data deve ser selecionada");

  // ─────────────────────────────────────────────────────────
  // TESTE 7: HORÁRIO, PAGAMENTO, LEMBRETE E CONFIRMAÇÃO
  // ─────────────────────────────────────────────────────────

  // 12) Escolher horário (opção 2)
  res = await processTestFlow({ sessionId: "s1", message: "2", session });
  assert.equal(session.stage, "ETAPA9_REMINDER", "Deve ir para lembrete após horário");
  assert.equal(session.selectedTime, "10:00 às 12:00");

  // 13) Lembrete (sim)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA8_PAYMENT", "Deve ir para pagamento após lembrete");
  assert.equal(session.wantsReminder, true);

  // 14) Escolher pagamento (PIX)
  res = await processTestFlow({ sessionId: "s1", message: "1", session });
  assert.equal(session.stage, "ETAPA10_CONFIRM", "Deve ir para confirmação final");
  assert.equal(session.paymentMethod, "PIX");

  const confirmText = res.map((r) => r.text).join("\n");

  // Verificar resumo final completo
  assert.match(confirmText, /RESUMO DO AGENDAMENTO/i, "Deve ter título RESUMO DO AGENDAMENTO");
  assert.ok(confirmText.includes("Gustavo"), "Deve mostrar cliente");
  assert.ok(confirmText.includes("Lavagem Simples"), "Deve mostrar serviço");
  assert.ok(confirmText.includes("Honda Civic"), "Deve mostrar veículo");
  assert.ok(confirmText.includes("08/07"), "Deve mostrar data");
  assert.ok(confirmText.includes("10:00"), "Deve mostrar horário");
  assert.ok(confirmText.includes("PIX"), "Deve mostrar pagamento");
  assert.ok(confirmText.includes("R$"), "Deve mostrar valor total");

  // 15) Confirmar agendamento
  res = await processTestFlow({ sessionId: "s1", message: "sim", session });
  const finalText = res.map((r) => r.text).join("\n");

  assert.match(finalText, /Tudo certo/i, "Mensagem final deve confirmar");
  assert.match(finalText, /cancelamento/i, "Deve mencionar política de cancelamento");
  assert.match(finalText, /2h/, "Deve mencionar 2h de antecedência");
  assert.match(finalText, /ajudar com mais alguma coisa/i, "Deve perguntar se pode ajudar");
  assert.ok(finalText.includes("Rua das Oficinas"), "Deve conter endereço");
  assert.ok(finalText.includes("08:00 às 18:00"), "Deve conter horário de funcionamento");
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