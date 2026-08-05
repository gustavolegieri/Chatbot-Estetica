import { describe, expect, it } from 'vitest';
import { normalizePieceRecommendation } from './coherenceGuard';

describe('normalizePieceRecommendation', () => {
  it('removes a second conflicting fabric and replaces a questionnaire-blocked color', () => {
    const result = normalizePieceRecommendation(
      'saia coluna midi de crepe pesado em couro nappa macio amarelo vivo',
      'amarelo vivo',
      { coresQueEvita: 'amarelo', coresQueAma: 'turquesa', tecidosPreferidos: ['Crepe'] },
      { paleta_cores_ideais: { cores_base: ['turquesa', 'verde-folha'] } },
    );

    expect(result.name).toContain('crepe pesado');
    expect(result.name).not.toContain('couro nappa');
    expect(result.name).not.toContain('amarelo');
    expect(result.name).toContain('turquesa');
    expect(result.color).toBe('turquesa');
  });

  it('keeps the exact garment color when the questionnaire did not block it', () => {
    const result = normalizePieceRecommendation(
      'mule slingback de couro nappa turquesa',
      'turquesa',
      { coresQueEvita: 'amarelo' },
      { paleta_cores_ideais: ['turquesa'] },
    );
    expect(result.name).toContain('turquesa');
    expect(result.color).toBe('turquesa');
  });

  it('does not mistake the letters in navy claro for a second wool fabric', () => {
    const result = normalizePieceRecommendation(
      'capa curta estruturada em seda crepe pesada navy claro',
      'navy claro',
      { coresQueEvita: 'amarelo' },
      { paleta_cores_ideais: ['navy claro'] },
    );
    expect(result.name).toBe('capa curta estruturada em seda crepe pesada navy claro');
    expect(result.color).toBe('navy claro');
  });
});
