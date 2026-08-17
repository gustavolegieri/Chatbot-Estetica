import assert from "node:assert/strict";
import test from "node:test";
import { classifyGateCrossing } from "./gate-vision";

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
