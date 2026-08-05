import { describe, expect, it } from 'vitest';
import { deriveStrategyScores, questionnaireList } from './questionnaireCoherence';

describe('questionnaireCoherence', () => {
  it('derives executive and modern priorities from literal answers', () => {
    const scores = deriveStrategyScores({
      objetivosImagem: ['Transmitir autoridade', 'Parecer mais elegante'],
      palavrasTransmitir: ['Moderna', 'Segura', 'Sofisticada'],
      cargo: 'CEO e consultora estratégica',
      culturaEmpresa: 'Corporativa com reuniões frequentes',
      conforto: 4,
    });
    expect(scores).not.toBeNull();
    expect(scores!.autoridade).toBeGreaterThanOrEqual(85);
    expect(scores!.modernidade).toBeGreaterThanOrEqual(75);
    expect(scores!.formalidade).toBeGreaterThanOrEqual(70);
    expect(scores!.conforto).toBe(78);
    expect(scores!.feminilidade).toBeLessThan(scores!.autoridade);
  });

  it('keeps questionnaire arrays literal and filters empty values', () => {
    expect(questionnaireList(['Autoridade', '', 'Elegância'])).toEqual(['Autoridade', 'Elegância']);
  });
});
