import test from "node:test";
import assert from "node:assert/strict";
import { buildTestServiceLookupWhere, normalizeConditionValue } from "./test-bot-processor";

test("buildTestServiceLookupWhere includes fallback by visible service name", () => {
  const where = buildTestServiceLookupWhere("lavagem_simples", "Lavagem Simples");

  assert.deepEqual(where.active, true);
  assert.deepEqual(where.OR?.[0], { catalogKey: "lavagem_simples" });
  assert.deepEqual(where.OR?.[1], {
    name: { contains: "Lavagem Simples", mode: "insensitive" },
  });
});

test("normalizeConditionValue handles damaged and poor condition descriptions", () => {
  assert.equal(normalizeConditionValue("ruim"), "ruim");
  assert.equal(normalizeConditionValue("arranhado"), "ruim");
  assert.equal(normalizeConditionValue("feio"), "ruim");
  assert.equal(normalizeConditionValue("bom"), "bom");
});
