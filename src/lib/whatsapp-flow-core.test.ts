import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCouponToFlowValue, buildAiDoubtFollowUpText, calculateFlowTotal, handleCouponStep, handleFAQ, handleLogistics, handleReceiptUpload, resolveDoubtReturnStage } from './whatsapp-flow-core';
import { etapa8Payment } from './whatsapp-flow-messages';
import type { FlowState } from './whatsapp-flow-types';
import { CATALOG } from './whatsapp-catalog';
import { getDefaultPromptMap } from './bot-prompts';

test('buildAiDoubtFollowUpText uses the official AI follow-up prompt', () => {
  const text = buildAiDoubtFollowUpText();

  assert.match(text, /Posso ajudar em mais alguma etapa\?/);
  assert.match(text, /Voltar para o atendimento/);
  assert.match(text, /Ver o menu principal/);
  assert.match(text, /Falar com um especialista/);
});

test('resolveDoubtReturnStage prefers the stored return stage', () => {
  const state = {
    stage: 'ETAPA10_FAQ',
    returnStage: 'ETAPA5_QUOTE',
  } as FlowState;

  assert.equal(resolveDoubtReturnStage(state), 'ETAPA5_QUOTE');
});

test('etapa8Payment uses the new payment labels', () => {
  const text = etapa8Payment(true);

  assert.match(text, /PIX/);
  assert.match(text, /Cartão \(na loja\)/);
  assert.match(text, /Dinheiro \(na loja\)/);
  assert.doesNotMatch(text, /Débito/);
  assert.doesNotMatch(text, /Crédito/);
});

test('calculateFlowTotal composes a base quote without applying discounts twice', () => {
  const total = calculateFlowTotal({
    stage: 'ETAPA15_SUMMARY_CONFIRM',
    quoteMin: 100,
    quoteDiscountMode: 'base',
    couponDiscountApplied: 10,
    firstTimeBonusApplied: true,
    firstTimeBonusDiscount: 10,
    upsellAccepted: true,
    upsellValue: 25,
    pickupFee: 15,
    loyaltyDiscountApplied: 5,
  });

  assert.equal(total, 115);
});

test('calculateFlowTotal preserves the total for legacy states with an already discounted quote', () => {
  const total = calculateFlowTotal({
    stage: 'ETAPA15_SUMMARY_CONFIRM',
    quoteMin: 90,
    couponDiscountApplied: 10,
    firstTimeBonusApplied: true,
    firstTimeBonusDiscount: 10,
  });

  assert.equal(total, 90);
});

test('percentage coupon uses quoteMin consistently across a price range', () => {
  const applied = applyCouponToFlowValue({
    coupon: { type: 'percent', amount: 10 },
    flow: { stage: 'ETAPA9_COUPON', quoteMin: 100, quoteMax: 200 },
  });

  assert.equal(applied.discountApplied, 10);
  assert.equal(calculateFlowTotal(applied.flow), 90);
});

test('first-visit coupon is not subtracted twice', () => {
  const total = calculateFlowTotal({
    stage: 'ETAPA15_SUMMARY_CONFIRM',
    quoteMin: 100,
    quoteDiscountMode: 'base',
    couponId: 'coupon-1',
    couponCode: 'PRIMEIRA10',
    couponDiscountApplied: 10,
    firstTimeBonusApplied: true,
    firstTimeBonusDiscount: 10,
  });

  assert.equal(total, 90);
});

test('receipt upload never marks payment as confirmed from a URL or simulated value', async () => {
  (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__ = true;

  try {
    const responses: Array<{ text: string }> = [];
    const result = await handleReceiptUpload(
      {
        stage: 'ETAPA8_RECEIPT_UPLOAD',
        quoteMin: 55,
        awaitingReceiptUpload: true,
      },
      'https://example.com/comprovante-valor55.jpg?valor55',
      responses,
    );

    assert.equal(result.nextState.stage, 'ETAPA8_RECEIPT_UPLOAD');
    assert.equal(result.nextState.awaitingReceiptUpload, true);
    assert.equal(result.nextState.totalPaid, undefined);
    assert.equal(result.nextState.receiptAmount, undefined);
    assert.match(responses.map((response) => response.text).join('\n'), /nenhum pagamento foi confirmado/i);
  } finally {
    delete (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__;
  }
});

test('coupon step skips the loyalty question when the client has no usable points', async () => {
  (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__ = true;
  try {
    const responses: Array<{ text: string }> = [];
    const result = await handleCouponStep(
      { stage: 'ETAPA9_COUPON', quoteMin: 100, loyaltyPoints: 0 },
      'nao',
      responses,
    );

    const text = responses.map((response) => response.text).join('\n');
    assert.equal(result.nextState.stage, 'ETAPA10_BUDGET');
    assert.match(text, /Resumo financeiro/i);
    assert.doesNotMatch(text, /0 pontos/i);
  } finally {
    delete (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__;
  }
});

test('logistics immediately shows payment choices when the client brings the vehicle', async () => {
  (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__ = true;
  try {
    const responses: Array<{ text: string }> = [];
    const result = await handleLogistics(
      { stage: 'ETAPA10_LOGISTICS', quoteMin: 100 },
      '1',
      responses,
    );

    const text = responses.map((response) => response.text).join('\n');
    assert.equal(result.nextState.stage, 'ETAPA8_PAYMENT');
    assert.match(text, /forma de pagamento/i);
    assert.match(text, /PIX/i);
    assert.match(text, /Cartão \(na loja\)/i);
  } finally {
    delete (globalThis as Record<string, unknown>).__BB_USE_PROMPT_FALLBACK__;
  }
});

test('accepting an AI recommendation advances directly to vehicle data', async () => {
  const runtime = globalThis as Record<string, unknown>;
  runtime.__BB_USE_PROMPT_FALLBACK__ = true;
  runtime.__BB_WCTX_MOCK__ = {
    catalog: { higienizacao_tecido: CATALOG.higienizacao_tecido },
    categories: {},
    servicesByKey: {},
    dbServiceIdByKey: { higienizacao_tecido: 'service-higienizacao-tecido' },
    prompts: getDefaultPromptMap(),
  };

  try {
    const responses: Array<{ text: string }> = [];
    const result = await handleFAQ(
      {
        stage: 'ETAPA10_FAQ',
        customerName: 'Gustavo',
        awaitingServiceRecommendation: false,
        serviceRecommendation: 'Recomendo: Higienização dos Bancos de Tecido - remove as manchas.',
        serviceRecommendationKey: 'higienizacao_tecido',
      },
      '1',
      responses,
    );

    const text = responses.map((response) => response.text).join('\n');
    assert.equal(result.nextState.stage, 'ETAPA4_VEHICLE');
    assert.equal(result.nextState.serviceKey, 'higienizacao_tecido');
    assert.equal(result.nextState.serviceRecommendation, null);
    assert.match(text, /Vamos agendar.*Higienização dos Bancos de Tecido/i);
    assert.match(text, /dados do veículo/i);
    assert.doesNotMatch(text, /Conte brevemente o que você busca/i);
    assert.doesNotMatch(text, /Agendar este serviço/i);
  } finally {
    delete runtime.__BB_USE_PROMPT_FALLBACK__;
    delete runtime.__BB_WCTX_MOCK__;
  }
});
