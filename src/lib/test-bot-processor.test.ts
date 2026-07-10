import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBudgetSummaryText,
  buildPaymentOptionsText,
  normalizeConditionValue,
  shouldSkipCouponPrompt,
} from "./test-bot-processor";

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
  assert.match(text, /Proteção/i);
  assert.match(text, /Cupom/i);
  assert.match(text, /Total/i);
});

test("buildPaymentOptionsText does not mention PIX discount", () => {
  const text = buildPaymentOptionsText();

  assert.match(text, /PIX/i);
  assert.doesNotMatch(text, /5%/);
});

test("shouldSkipCouponPrompt treats natural no answers as a skip", () => {
  assert.equal(shouldSkipCouponPrompt("2"), true);
  assert.equal(shouldSkipCouponPrompt("não"), true);
  assert.equal(shouldSkipCouponPrompt("não tenho"), true);
  assert.equal(shouldSkipCouponPrompt("sem cupom"), true);
  assert.equal(shouldSkipCouponPrompt("sim"), false);
});