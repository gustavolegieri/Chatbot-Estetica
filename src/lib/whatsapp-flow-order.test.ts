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

test("official scheduling flow keeps one ordered prompt per customer reply", async () => {
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  process.env.CEREBRAS_API_KEY = "";
  process.env.GROQ_API_KEY = "";
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
    assert.match(replies[0], /como você prefere ser chamado/i);

    assert.equal((await reply("Gustavo")).length, 1);
    assert.equal(state.stage, "ETAPA2_MAIN_MENU");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA2_SUB");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA3_SERVICE_ACTION");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA4_VEHICLE");

    assert.equal((await reply("Fiesta 2012, FEG4B58, branco, estado bom")).length, 1);
    assert.equal(state.stage, "ETAPA4_VEHICLE");
    assert.equal(state.vehicleCollectStep, undefined);
    assert.equal(state.vehicleModel, "Fiesta");
    assert.equal(state.vehiclePlate, "FEG4B58");

    const calendarReply = await reply("1");
    assert.equal(calendarReply.length, 1);
    assert.match(calendarReply[0], /^\[MÍDIA: image\|/);
    assert.match(calendarReply[0], /Lavagem Simples/);
    assert.equal(state.stage, "ETAPA7_DAY");

    assert.equal((await reply(nextBusinessDate())).length, 1);
    assert.equal(state.stage, "ETAPA7_TIME");
    assert.ok((state.availableSlots?.length ?? 0) > 0);

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA9_COUPON");

    assert.equal((await reply("2")).length, 1);
    assert.equal(state.stage, "ETAPA10_BUDGET");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA10_LOGISTICS");

    assert.equal((await reply("1")).length, 1);
    assert.equal(state.stage, "ETAPA8_PAYMENT");

    const paymentReply = await reply("1");
    assert.equal(paymentReply.length, 1);
    assert.match(paymentReply[0], /PIX no dia do atendimento/i);
    assert.match(paymentReply[0], /lembrete/i);
    assert.equal(state.stage, "ETAPA14_REMINDER");

    const summaryReply = await reply("1");
    assert.equal(summaryReply.length, 1);
    assert.match(summaryReply[0], /Resumo do agendamento/i);
    assert.equal(state.stage, "ETAPA15_SUMMARY_CONFIRM");

    const confirmationReply = await reply("1");
    assert.equal(confirmationReply.length, 1);
    assert.match(confirmationReply[0], /Agendamento confirmado/i);
    assert.equal(state.stage, "ETAPA2_MAIN_MENU");
    assert.equal(state.awaitingPostConfirmationReturn, true);
  } finally {
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
