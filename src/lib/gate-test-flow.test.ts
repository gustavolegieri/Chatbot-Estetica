import test from "node:test";
import assert from "node:assert/strict";
import { parseGateTestCommand } from "./gate-test-flow";

test("comandos do portão de teste são explícitos e não confundem o fluxo normal", () => {
  assert.equal(parseGateTestCommand("simular entrada"), "ENTER");
  assert.equal(parseGateTestCommand("carro saiu"), "EXIT");
  assert.equal(parseGateTestCommand("simular finalização"), "COMPLETE");
  assert.equal(parseGateTestCommand("quero agendar uma lavagem"), null);
});
