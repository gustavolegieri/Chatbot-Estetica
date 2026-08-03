import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJundiaiMobile } from "@/lib/jundiai-lead";

test("accepts Jundiai mobile numbers and normalizes the Brazilian country code", () => {
  assert.equal(normalizeJundiaiMobile("(11) 97285-1072"), "5511972851072");
  assert.equal(normalizeJundiaiMobile("+55 11 97285-1072"), "5511972851072");
});

test("rejects landlines and mobile numbers outside DDD 11", () => {
  assert.equal(normalizeJundiaiMobile("(11) 4722-1234"), null);
  assert.equal(normalizeJundiaiMobile("(19) 99999-1234"), null);
});
