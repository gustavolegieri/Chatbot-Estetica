import test from "node:test";
import assert from "node:assert/strict";
import { detectRequestedTimePreference, extractExplicitCustomerName } from "./whatsapp-flow";
import { initialRequestSummary } from "./whatsapp-flow-messages";
import { wantsHumanHandoff } from "./whatsapp-handoff";
import { wantsToSchedule } from "./whatsapp-intent";

test("extracts the customer name and period from a complete first message", () => {
  const message = "Gustavo, meu Civic 2021 branco precisa de lavagem simples para sábado de manhã";
  assert.equal(extractExplicitCustomerName(message), "Gustavo");
  assert.equal(detectRequestedTimePreference(message), "morning");
});

test("natural confirmations can advance a service without a menu number", () => {
  assert.equal(wantsToSchedule("quero lavagem simples mesmo", null), true);
  assert.equal(wantsToSchedule("pode ser essa mesma", null), true);
  assert.equal(wantsToSchedule("vamos nessa", null), true);
});

test("initial summary keeps the existing WhatsApp visual language", () => {
  const summary = initialRequestSummary({
    name: "Gustavo",
    vehicle: "Civic 2021, branco, normal",
    service: "Lavagem Simples",
    date: "Sábado",
    period: "manhã",
  });
  assert.match(summary, /Gustavo/);
  assert.match(summary, /Civic 2021/);
  assert.match(summary, /Lavagem Simples/);
  assert.match(summary, /Sábado/);
  assert.match(summary, /responder com o número ou escrever naturalmente/i);
});

test("free-text requests for a real person trigger handoff", () => {
  assert.equal(wantsHumanHandoff("isso aqui é só robô?"), true);
  assert.equal(wantsHumanHandoff("me chama um atendente"), true);
});
