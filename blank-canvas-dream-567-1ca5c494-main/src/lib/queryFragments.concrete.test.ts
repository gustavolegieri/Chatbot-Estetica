import { describe, it, expect } from 'vitest';
import { buildSectionQuery, type ProfileFragments } from './queryFragments';

describe('buildSectionQuery', () => {
  it('builds concrete product-shot section queries instead of abstract wording', () => {
    const profile: ProfileFragments = {
      estilo: 'moderno',
      paleta: 'neutros_quentes',
      tecido: 'seda',
      estampa: 'liso',
      rotina: 'hibrido',
      ocasiao: 'everyday',
    };

    const query = buildSectionQuery('estilo', profile);

    expect(query).toContain('product shot');
    expect(query).toContain('woman');
    expect(query).toContain('fashion');
    expect(query).not.toContain('street style');
  });
});
