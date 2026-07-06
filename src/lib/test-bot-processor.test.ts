import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBudgetSummaryText,
  buildPaymentOptionsText,
  buildTestServiceLookupWhere,
  normalizeConditionValue,
} from "./test-bot-processor";

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

test("buildBudgetSummaryText includes service, complement, coupon and total values", () => {
  const text = buildBudgetSummaryText({
    serviceLabel: "Lavagem completa",
    serviceValue: 180,
    complementValue: 40,
    couponDiscount: 20,
    totalValue: 200,
  });

  assert.match(text, /Lavagem completa/i);
  assert.match(text, /Complemento/i);
  assert.match(text, /Cupom/i);
  assert.match(text, /Total/i);
});

test("buildPaymentOptionsText does not mention PIX discount", () => {
  const text = buildPaymentOptionsText();

  assert.match(text, /PIX/i);
  assert.doesNotMatch(text, /5%/);
});
