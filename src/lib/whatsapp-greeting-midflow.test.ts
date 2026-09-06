import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultPromptMap } from "./bot-prompts";
import { prisma } from "./prisma";
import { CATALOG, CATEGORIES } from "./whatsapp-catalog";
import { processNumberedFlow } from "./whatsapp-flow";
import { greetingByTime, isConversationOpener } from "./whatsapp-intent";
import type { FlowState } from "./whatsapp-flow-types";

test("isConversationOpener separa quem abre conversa de quem confirma", () => {
  for (const abertura of ["oi", "Oi!", "olá", "Bom dia", "boa noite", "opa", "e aí", "tudo bem"]) {
    assert.equal(isConversationOpener(abertura), true, abertura);
  }
  // Estas continuam sendo small talk, mas respondem ao bot — não abrem assunto.
  for (const resposta of ["ok", "beleza", "pera aí", "entendi", "perfeito", "valeu"]) {
    assert.equal(isConversationOpener(resposta), false, resposta);
  }
});

test("greetingByTime acompanha o relógio de Brasília", () => {
  assert.equal(greetingByTime(new Date("2026-09-05T13:00:00Z")), "Bom dia"); // 10h BRT
  assert.equal(greetingByTime(new Date("2026-09-05T18:00:00Z")), "Boa tarde"); // 15h BRT
  assert.equal(greetingByTime(new Date("2026-09-05T23:00:00Z")), "Boa noite"); // 20h BRT
});

test("um 'oi' no meio do fluxo recebe menu de verdade, não um beco sem saída", async () => {
  // Regressão do relato: um "oi" numa sessão parada em etapa intermediária era
  // respondido com "Claro 😊 Digite *menu* para ver opções." — o cliente
  // cumprimenta e recebe uma instrução, sem nenhuma opção para tocar.
  const originalSettingsFindUnique = prisma.settings.findUnique;
  const originalClientFindUnique = prisma.client.findUnique;
  (prisma.settings as any).findUnique = async () => null;
  (prisma.client as any).findUnique = async () => null;
  (globalThis as any).__BB_WCTX_MOCK__ = {
    catalog: CATALOG,
    categories: CATEGORIES,
    servicesByKey: {},
    dbServiceIdByKey: {},
    prompts: getDefaultPromptMap(),
  };

  try {
    const state: FlowState = {
      stage: "ETAPA4_VEHICLE",
      welcomed: true,
      customerName: "Maria",
      serviceKey: "lavagem_simples",
    };
    const respostas: string[] = [];

    await processNumberedFlow(
      {
        phone: "5511000000099",
        text: "oi",
        pushName: "Maria",
        testMode: {
          skipDb: true,
          sendTextCallback: async (text: string) => {
            respostas.push(text);
          },
        },
      },
      state
    );

    assert.ok(respostas.length > 0, "o bot precisa responder ao cumprimento");
    const tudo = respostas.join("\n");
    assert.doesNotMatch(tudo, /digite \*?menu\*? para ver op/i);
    assert.match(tudo, /^(Bom dia|Boa tarde|Boa noite), \*Maria\*!/);
    // Menu principal de verdade: pelo menos duas opções numeradas tocáveis.
    const opcoes = tudo.match(/^\s*\*\d{1,2}\*/gm) ?? [];
    assert.ok(opcoes.length >= 2, `esperava opções numeradas, veio: ${tudo}`);
  } finally {
    (prisma.settings as any).findUnique = originalSettingsFindUnique;
    (prisma.client as any).findUnique = originalClientFindUnique;
    delete (globalThis as any).__BB_WCTX_MOCK__;
  }
});
