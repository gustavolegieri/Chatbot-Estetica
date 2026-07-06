import test from "node:test";
import assert from "node:assert/strict";
import { isValidCustomerName, buildVehicleCollectionPrompt } from "./flow-validation";

test("isValidCustomerName rejects menu-like or empty input", () => {
  assert.equal(isValidCustomerName("1"), false);
  assert.equal(isValidCustomerName("sim"), false);
  assert.equal(isValidCustomerName(""), false);
  assert.equal(isValidCustomerName("João"), true);
  assert.equal(isValidCustomerName("Maria Silva"), true);
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
