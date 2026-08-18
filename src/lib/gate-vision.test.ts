import assert from "node:assert/strict";
import test from "node:test";
import { classifyGateCrossing, gateStageMeta, selectAppointmentByPlate } from "./gate-vision";
import { getDefaultPromptMap, renderPrompt } from "./bot-prompts";

test("outside to inside starts the wash", () => {
  assert.equal(classifyGateCrossing([0.18, 0.35, 0.48, 0.65, 0.73]), "ENTER");
});

test("inside to outside starts finalization", () => {
  assert.equal(classifyGateCrossing([0.75, 0.64, 0.53, 0.39, 0.20]), "EXIT");
});

test("movement that does not fully cross the gate boundary is ignored", () => {
  assert.equal(classifyGateCrossing([0.25, 0.37, 0.51, 0.39]), null);
  assert.equal(classifyGateCrossing([0.75, 0.68, 0.64]), null);
});

test("small oscillations over the gate line do not trigger an event", () => {
  assert.equal(classifyGateCrossing([0.57, 0.59, 0.575, 0.585]), null);
});

test("plate selects only the appointment for the correct customer", () => {
  const appointments = [
    { id: "ana", client: { vehiclePlate: "ABC1D23" } },
    { id: "gustavo", client: { vehiclePlate: "FEG-4B58" } },
  ];
  assert.equal(selectAppointmentByPlate(appointments, "feg4b58")?.id, "gustavo");
  assert.equal(selectAppointmentByPlate(appointments, "FEG4B59"), null);
  assert.equal(selectAppointmentByPlate(appointments, "COROLLA"), null);
});

test("test mode plate selection is restricted to the authorized phone", () => {
  const appointments = [
    { id: "old-demo", client: { vehiclePlate: "FEG4B58", phone: "5500119786435" } },
    { id: "authorized", client: { vehiclePlate: "FEG4B58", phone: "5511944400696" } },
  ];

  assert.equal(
    selectAppointmentByPlate(appointments, "FEG4B58", "5511944400696")?.id,
    "authorized"
  );
});

test("exit means finalizing and not completed", () => {
  assert.equal(gateStageMeta.FINALIZING.label, "Em finalização");
  assert.equal("FINALIZED" in gateStageMeta, false);
});

test("automatic gate messages identify customer, vehicle and plate", () => {
  const prompts = getDefaultPromptMap();
  const variables = {
    name: "Gustavo",
    service: "Lavagem técnica",
    vehicle: "Honda Fit 2020",
    plate: "FEG4B58",
    brand: "Garagem do Ka",
  };
  const started = renderPrompt(prompts, "appointment_checkin", variables);
  const finalizing = renderPrompt(prompts, "appointment_finalizing", variables);
  for (const message of [started, finalizing]) {
    assert.match(message, /Gustavo/);
    assert.match(message, /Honda Fit 2020/);
    assert.match(message, /FEG4B58/);
  }
  assert.match(started, /Seu veículo já está em atendimento/);
  assert.match(started, /Lavagem iniciada/);
  assert.match(finalizing, /avançou para a finalização/);
  assert.match(finalizing, /Acabamento e conferência final/);
});
