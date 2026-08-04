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
    assert.equal(doubtReplies.length, 3);
    assert.match(doubtReplies[0].text, /você está falando com/i);
    assert.equal(doubtReplies[0].voiceReply, false);
    assert.equal(doubtReplies[1].voiceReply, true);
    assert.match(doubtReplies[2].text, /como posso te chamar/i);

    const namedDoubtReplies: Array<{ text: string; voiceReply?: boolean }> = [];
    await startFlow({
      phone: "5511000000003",
      text: "Qual valor do polimento?",
      pushName: "Ana",
      testMode: {
        skipDb: true,
        sendTextCallback: async (text, metadata) => {
          namedDoubtReplies.push({ text, voiceReply: metadata?.voiceReply });
        },
      },
    });
    assert.equal(namedDoubtReplies.length, 3);
    assert.match(namedDoubtReplies[0].text, /você está falando com/i);
    assert.equal(namedDoubtReplies[1].voiceReply, true);
    assert.doesNotMatch(namedDoubtReplies[1].text, /se quiser agendar/i);
    assert.match(namedDoubtReplies[2].text, /se quiser agendar/i);

    const variedQuestions = [
      "Vocês aceitam cartão?",
      "A vitrificação tem garantia?",
      "Me fale os detalhes da higienização",
      "pix?",
    ];
    for (const [index, question] of variedQuestions.entries()) {
      const replies: Array<{ text: string; voiceReply?: boolean }> = [];
      await startFlow({
        phone: `55110000001${index}`,
        text: question,
        pushName: "Ana",
        testMode: {
          skipDb: true,
          sendTextCallback: async (text, metadata) => {
            replies.push({ text, voiceReply: metadata?.voiceReply });
          },
        },
      });
      assert.equal(replies.length, 3, question);
      assert.equal(replies[1].voiceReply, true, question);
      assert.equal(replies[2].voiceReply, undefined, question);
    }

    let state: FlowState = {
      stage: "ETAPA1_AWAITING_NAME",
    };
    const availabilityReplies: string[] = [];
    const availabilityVoiceFlags: Array<boolean | undefined> = [];
    const testMode = {
      skipDb: true,
      sendTextCallback: async (text: string, metadata?: { voiceReply?: boolean }) => {
        availabilityReplies.push(text);
        availabilityVoiceFlags.push(metadata?.voiceReply);
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
    assert.ok(availabilityVoiceFlags.includes(true));
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
