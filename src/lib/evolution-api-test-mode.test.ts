import test from "node:test";
import assert from "node:assert/strict";
import { testModeAllowsRecipient } from "./evolution-api";

test("modo de teste permite somente o telefone configurado", () => {
  assert.equal(testModeAllowsRecipient("+55 11 94440-0696", true, "5511944400696"), true);
  assert.equal(testModeAllowsRecipient("5511972851072", true, "5511944400696"), false);
  assert.equal(testModeAllowsRecipient("5511944400696", true, null), false);
});

test("envios normais continuam liberados quando o modo de teste está desligado", () => {
  assert.equal(testModeAllowsRecipient("5511972851072", false, "5511944400696"), true);
});
