import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultPromptMap } from "./bot-prompts";
import { prisma } from "./prisma";
import { CATALOG, CATEGORIES } from "./whatsapp-catalog";
import { processNumberedFlow, startFlow } from "./whatsapp-flow";
import type { FlowState } from "./whatsapp-flow-types";

test("first doubt uses voice and availability keeps calendar date until service selection", async () => {
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const originalSettingsFindUnique = prisma.settings.findUnique;
  const originalAppointmentFindMany = prisma.appointment.findMany;

  process.env.CEREBRAS_API_KEY = "";
  (prisma.settings as any).findUnique = async () => null;
  (prisma.appointment as any).findMany = async () => [];
  (globalThis as any).__BB_WCTX_MOCK__ = {
    catalog: CATALOG,
    categories: CATEGORIES,
    servicesByKey: {},
    dbServiceIdByKey: {},
    prompts: getDefaultPromptMap(),
  };

  try {
    const doubtReplies: Array<{ text: string; voiceReply?: boolean }> = [];
    await startFlow({
      phone: "5511000000001",
      text: "Quanto custa o polimento?",
      testMode: {
        skipDb: true,
        sendTextCallback: async (text, metadata) => {
          doubtReplies.push({ text, voiceReply: metadata?.voiceReply });
        },
      },
    });
    assert.equal(doubtReplies.length, 1);
    assert.equal(doubtReplies[0].voiceReply, true);
    assert.match(doubtReplies[0].text, /você está falando com/i);

    let state: FlowState = {
      stage: "ETAPA1_AWAITING_NAME",
    };
    const availabilityReplies: string[] = [];
    const testMode = {
      skipDb: true,
      sendTextCallback: async (text: string) => {
        availabilityReplies.push(text);
      },
      onFlowStateChange: (next: FlowState) => {
        state = next;
      },
    };

    await startFlow({
      phone: "5511000000002",
      text: "Tem horário pra hoje?",
      pushName: "Gustavo",
      testMode,
    });
    assert.equal(state.stage, "ETAPA2_MAIN_MENU");
    assert.equal(state.pendingInitialIntent, "schedule");
    assert.ok(state.dayDate);
    assert.ok(availabilityReplies.some((text) => /saber qual serviço/i.test(text)));
    assert.ok(availabilityReplies.some((text) => text.startsWith("[MÍDIA: image|")));

    availabilityReplies.length = 0;
    await processNumberedFlow(
      {
        phone: "5511000000002",
        text: "2026-08-05",
        pushName: "Gustavo",
        testMode,
      },
      state
    );
    assert.equal(state.dayDate, "2026-08-05");
    assert.ok(availabilityReplies.some((text) => /saber qual serviço/i.test(text)));

    availabilityReplies.length = 0;
    await processNumberedFlow(
      {
        phone: "5511000000002",
        text: "lavagem simples",
        pushName: "Gustavo",
        testMode,
      },
      state
    );
    assert.equal(state.stage, "ETAPA3_SERVICE_ACTION");
    assert.equal(state.serviceKey, "lavagem_simples");
    assert.equal(state.dayDate, "2026-08-05");
  } finally {
    (prisma.settings as any).findUnique = originalSettingsFindUnique;
    (prisma.appointment as any).findMany = originalAppointmentFindMany;
    delete (globalThis as any).__BB_WCTX_MOCK__;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
  }
});
