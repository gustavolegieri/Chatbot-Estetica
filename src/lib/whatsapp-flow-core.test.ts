import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiDoubtFollowUpText, resolveDoubtReturnStage } from './whatsapp-flow-core';
import { etapa8Payment } from './whatsapp-flow-messages';
import type { FlowState } from './whatsapp-flow-types';

test('buildAiDoubtFollowUpText uses the short follow-up prompt', () => {
  const text = buildAiDoubtFollowUpText();

  assert.match(text, /Posso te ajudar com mais alguma coisa\?/);
  assert.match(text, /Voltar para onde eu estava/);
  assert.match(text, /Ver menu principal/);
  assert.match(text, /Falar com o dono/);
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
