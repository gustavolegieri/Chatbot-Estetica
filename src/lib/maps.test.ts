import test from "node:test";
import assert from "node:assert/strict";
import { calculatePickupFee } from "./maps";

test("calculatePickupFee sums the base fee and per-km fee", () => {
  assert.equal(calculatePickupFee(4.5, 2.5, 5), 16.25);
  assert.equal(calculatePickupFee(0, 2.5, 5), 5);
});
