import test from "node:test";
import assert from "node:assert/strict";
import { testModeAllowsRecipient } from "./evolution-api";
import {
  extractWasenderSendId,
  firstWasenderMessage,
  isAuthorizedSelfTestPhone,
} from "./whatsapp-self-test";

test("modo de teste permite somente o telefone configurado", () => {
  assert.equal(testModeAllowsRecipient("+55 11 94440-0696", true, "5511944400696"), true);
  assert.equal(testModeAllowsRecipient("5511972851072", true, "5511944400696"), false);
  assert.equal(testModeAllowsRecipient("5511944400696", true, null), false);
});

test("envios normais continuam liberados quando o modo de teste está desligado", () => {
  assert.equal(testModeAllowsRecipient("5511972851072", false, "5511944400696"), true);
});

test("autoteste aceita somente mensagens próprias do número autorizado", () => {
  assert.equal(isAuthorizedSelfTestPhone("+55 11 94440-0696", true, "5511944400696"), true);
  assert.equal(isAuthorizedSelfTestPhone("5511972851072", true, "5511944400696"), false);
  assert.equal(isAuthorizedSelfTestPhone("5511944400696", false, "5511944400696"), false);
});

test("normaliza messages.upsert em lista e captura o ID retornado pelo envio", () => {
  const message = firstWasenderMessage({ messages: [{ key: { id: "manual-1" } }] });
  assert.deepEqual(message, { key: { id: "manual-1" } });
  assert.equal(extractWasenderSendId({ success: true, data: { msgId: 72278717 } }), "72278717");
});
