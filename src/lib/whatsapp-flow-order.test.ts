import assert from "node:assert/strict";
import test from "node:test";
import { addDays, format } from "date-fns";
import { getDefaultPromptMap } from "./bot-prompts";
import { prisma } from "./prisma";
import { CATALOG, CATEGORIES } from "./whatsapp-catalog";
import { processNumberedFlow, startFlow } from "./whatsapp-flow";
import type { FlowState } from "./whatsapp-flow-types";

function nextBusinessDate() {
  let date = addDays(new Date(), 2);
  while (date.getDay() === 0) date = addDays(date, 1);
  return format(date, "dd/MM/yyyy");
}

test("simple greeting starts immediately without calling an AI provider", async () => {
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousFetch = globalThis.fetch;
  const originalSettingsFindUnique = prisma.settings.findUnique;
  process.env.CEREBRAS_API_KEY = "configured-but-must-not-be-called";
  process.env.GROQ_API_KEY = "";
  (prisma.settings as any).findUnique = async () => null;
  (globalThis as any).__BB_WCTX_MOCK__ = {
    catalog: CATALOG,
    categories: CATEGORIES,
    servicesByKey: {},
    dbServiceIdByKey: {},
    prompts: getDefaultPromptMap(),
  };
  globalThis.fetch = (async () => {
    throw new Error("A saudação simples não deve consultar IA");
  }) as typeof fetch;

  const replies: string[] = [];
  try {
    await startFlow({
      phone: "5511000000888",
      text: "Olá",
      testMode: {
        skipDb: true,
        sendTextCallback: async (text: string) => {
          replies.push(text);
        },
      },
    });
    assert.equal(replies.length, 1);
    assert.match(replies[0], /como prefere ser chamado/i);
  } finally {
    globalThis.fetch = previousFetch;
    (prisma.settings as any).findUnique = originalSettingsFindUnique;
    delete (globalThis as any).__BB_WCTX_MOCK__;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  }
});

test("official scheduling flow keeps one ordered prompt per customer reply", async () => {
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.CEREBRAS_API_KEY = "configured-but-must-not-be-called";
  process.env.GROQ_API_KEY = "";
  globalThis.fetch = (async () => {
    throw new Error("Etapas objetivas do agendamento não devem consultar IA");
  }) as typeof fetch;
  const originalSettingsFindUnique = prisma.settings.findUnique;
  const originalAppointmentFindMany = prisma.appointment.findMany;
  (prisma.settings as any).findUnique = async () => null;
  (prisma.appointment as any).findMany = async () => [];
  (globalThis as any).__BB_WCTX_MOCK__ = {
    catalog: CATALOG,
    categories: CATEGORIES,
    servicesByKey: {},
    dbServiceIdByKey: {},
    prompts: getDefaultPromptMap(),
  };
  (globalThis as any).__BB_SKIP_SUMMARY_CARD__ = true;

  let state: FlowState = { stage: "ETAPA1_AWAITING_NAME" };
  let replies: string[] = [];
  const testMode = {
    skipDb: true,
    sendTextCallback: async (text: string) => {
      replies.push(text);
    },
    onFlowStateChange: (next: FlowState) => {
      state = { ...next };
    },
  };
  const phone = "5511000000999";

  const reply = async (text: string) => {
    replies = [];
    await processNumberedFlow({ phone, text, testMode }, state);
    return replies;
  };

  try {
    await startFlow({ phone, text: "Olá", testMode });
    assert.equal(state.stage, "ETAPA1_AWAITING_NAME");
    assert.equal(replies.length, 1);
    assert.match(replies[0], /como prefere ser chamado/i);

    assert.equal((await reply("Gustavo")).length, 1);
    assert.equal(state.stage, "ETAPA2_MAIN_MENU");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA2_SUB");

    // Escolher o serviço na lista já é a decisão de agendar: o detalhe e o
    // pedido dos dados do veículo saem na mesma mensagem.
    const detalhe = await reply("1");
    assert.equal(detalhe.length, 1);
    assert.match(detalhe[0], /Lavagem Simples/i);
    assert.match(detalhe[0], /me conte do carro|ve[íi]culo/i);
    assert.equal(state.stage, "ETAPA4_VEHICLE");

    // Com o veículo reconhecido não há tela de "confirma que é um Fiesta?": o
    // orçamento vira a legenda do calendário e a lista de datas vem logo abaixo.
    // São duas mensagens porque legenda de imagem não aceita menu — é a única
    // etapa do fluxo em que isso acontece.
    const orcamento = await reply("Fiesta 2012, FEG4B58, branco, estado bom");
    assert.equal(orcamento.length, 2);
    assert.match(orcamento[0], /^\[MÍDIA: image\|/);
    assert.match(orcamento[0], /Lavagem Simples/);
    assert.match(orcamento[1], /Quando fica melhor/i);
    assert.equal(state.vehicleModel, "Fiesta");
    assert.equal(state.vehiclePlate, "FEG4B58");
    assert.equal(state.stage, "ETAPA7_DAY");

    // A lista abre por atalhos de horário e segue por semana; um atalho fecha
    // data e hora de uma vez.
    const atalho = state.pickerOptions!.find((o) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(o.id));
    assert.ok(atalho, "a lista de datas deve trazer atalhos de horário");
    assert.ok(
      state.pickerOptions!.some((o) => o.id.startsWith("semana:")),
      "a lista de datas deve trazer as semanas"
    );

    // Cupom, logística, pagamento e lembrete deixaram de ser etapas
    // obrigatórias e passaram a ser opções do próprio resumo — a cauda entre o
    // compromisso e a reserva era onde o cliente desistia.
    const summaryReply = await reply(atalho!.id);
    assert.equal(summaryReply.length, 1);
    assert.match(summaryReply[0], /Resumo do agendamento/i);
    assert.equal(state.stage, "ETAPA15_SUMMARY_CONFIRM");

    // Padrões assumidos, todos visíveis no resumo.
    assert.equal(state.needsPickup, false);
    assert.equal(state.paymentMethod, "Dinheiro (na loja)");
    assert.equal(state.reminderEnabled, true);

    // As etapas antigas continuam alcançáveis a partir do resumo.
    const couponReply = await reply("4");
    assert.equal(state.stage, "ETAPA9_COUPON");
    assert.match(couponReply[0], /cupom/i);

    const logisticsReply = await reply("2");
    assert.equal(logisticsReply.length, 1);
    assert.match(logisticsReply[0], /Como o veículo chegará/i);
    assert.equal(state.stage, "ETAPA10_LOGISTICS");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA8_PAYMENT");

    const paymentReply = await reply("1");
    assert.equal(paymentReply.length, 1);
    assert.match(paymentReply[0], /PIX no dia do atendimento/i);
    assert.match(paymentReply[0], /lembrete/i);
    assert.equal(state.stage, "ETAPA14_REMINDER");

    const summaryAgain = await reply("1");
    assert.equal(summaryAgain.length, 1);
    assert.match(summaryAgain[0], /Resumo do agendamento/i);
    assert.equal(state.stage, "ETAPA15_SUMMARY_CONFIRM");

    const confirmationReply = await reply("1");
    assert.equal(confirmationReply.length, 1);
    assert.match(confirmationReply[0], /Agendamento confirmado/i);
    assert.equal(state.stage, "ETAPA2_MAIN_MENU");
    assert.equal(state.awaitingPostConfirmationReturn, true);
  } finally {
    globalThis.fetch = previousFetch;
    (prisma.settings as any).findUnique = originalSettingsFindUnique;
    (prisma.appointment as any).findMany = originalAppointmentFindMany;
    delete (globalThis as any).__BB_WCTX_MOCK__;
    delete (globalThis as any).__BB_SKIP_SUMMARY_CARD__;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  }
});
