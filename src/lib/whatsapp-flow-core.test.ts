import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiDoubtFollowUpText, calculateFlowTotal, handleReceiptUpload, resolveDoubtReturnStage } from './whatsapp-flow-core';
import { etapa8Payment } from './whatsapp-flow-messages';
import type { FlowState } from './whatsapp-flow-types';

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
