import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeConversationRules,
  isDeterministicConversationTurn,
} from "./conversation-intelligence";

test("classifies a scheduling lead without requiring a human", () => {
  const result = analyzeConversationRules("Quero agendar um polimento para sábado de manhã");
  assert.equal(result.intent, "schedule");
  assert.equal(result.needsHuman, false);
  assert.ok(result.leadScore >= 60);
});

test("escalates a real complaint conservatively", () => {
  const result = analyzeConversationRules("Estou muito irritado, riscaram meu carro e ninguém responde");
  assert.equal(result.intent, "complaint");
  assert.equal(result.needsHuman, true);
  assert.equal(result.tone, "reassuring");
});

test("detects price objection", () => {
  const result = analyzeConversationRules("Achei muito caro, tem alguma opção melhor?");
  assert.equal(result.objection, "price");
});

test("does not send transactional flow choices to remote AI", () => {
  assert.equal(isDeterministicConversationTurn("Fiesta 2012, FEG4B58, branco, bom estado", "ETAPA4_VEHICLE"), true);
  assert.equal(isDeterministicConversationTurn("25/08", "ETAPA7_DAY"), true);
  assert.equal(isDeterministicConversationTurn("08:00", "ETAPA7_TIME"), true);
  assert.equal(isDeterministicConversationTurn("1", "ETAPA2_MAIN_MENU"), true);
  assert.equal(isDeterministicConversationTurn("Quanto custa o polimento?", "ETAPA2_MAIN_MENU"), false);
});
