import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidCustomerName,
  buildVehicleCollectionPrompt,
  buildVehicleConfirmationPrompt,
  buildCalendarPrompt,
} from "./flow-validation";

test("isValidCustomerName rejects menu-like, empty and nonsense input", () => {
  assert.equal(isValidCustomerName("1"), false);
  assert.equal(isValidCustomerName("sim"), false);
  assert.equal(isValidCustomerName(""), false);
  assert.equal(isValidCustomerName("ffds"), false);
  assert.equal(isValidCustomerName("asdf"), false);
  assert.equal(isValidCustomerName("1234"), false);
  assert.equal(isValidCustomerName("a"), false);
  assert.equal(isValidCustomerName("João"), true);
  assert.equal(isValidCustomerName("Gustavo"), true);
});

test("buildVehicleCollectionPrompt asks for the missing field and preserves collected data", () => {
  const prompt = buildVehicleCollectionPrompt({
    model: "Honda Civic",
    year: null,
    color: null,
    condition: null,
  });

  assert.match(prompt, /ano/i);
  assert.match(prompt, /Honda Civic/i);
});

test("buildVehicleConfirmationPrompt and buildCalendarPrompt render the new structured flow", () => {
  const confirmation = buildVehicleConfirmationPrompt({
    model: "Honda Civic",
    year: "2020",
    color: "Preto",
    condition: "Bom estado",
  });

  assert.match(confirmation, /Honda Civic/i);
  assert.match(confirmation, /2020/i);
  assert.match(confirmation, /Preto/i);
  assert.match(confirmation, /sim\/não/i);

  const calendar = buildCalendarPrompt(new Date("2026-07-01T12:00:00Z"));
  assert.match(calendar, /Julho 2026/i);
  assert.match(calendar, /Hoje/i);
  assert.match(calendar, /dias disponíveis/i);
  assert.match(calendar, /🔴|🟡|🟢/i);
  assert.match(calendar, /voltar ao início/i);
});
