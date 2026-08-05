import { describe, it, expect } from 'vitest';
import { buildPieceQuery, buildSectionQueryLadder } from './pieceFragments';

describe('buildPieceQuery', () => {
  it('produces a simple capsule wardrobe query with clothing type, color, and modern woman style', () => {
    const query = buildPieceQuery('bolsa camurça azul', 'azul', 'bolsas', null, null);

    expect(query.query).toBe('bolsa azul moderno woman');
  });

  it('preserves subtype and color for footwear searches such as mocassim flat preto', () => {
    const query = buildPieceQuery('mocassim flat preto', 'preto', 'calcados', null, null);

    expect(query.query).toContain('mocassim');
    expect(query.query).toContain('preto');
    expect(query.query).toContain('moderno');
    expect(query.query).toContain('woman');
  });

  it('builds richer section ladders that keep style, color, and fabric in the query', () => {
    const ladder = buildSectionQueryLadder('estilo', {
      diagnosisId: 'diag-1',
      colorEN: 'black',
      colorNative: 'black',
      fabricEN: 'silk',
      paletteLabelEN: 'soft winter palette',
      styleEN: 'classic',
      genderAnchor: 'woman',
      hardNegatives: [],
      debug: {
        rawSkinTone: null,
        rawStyle: null,
        rawColorSource: null,
        rawFabricSource: null,
      },
    });

    expect(ladder[0]).toContain('classic');
    expect(ladder[0]).toContain('black');
    expect(ladder[0]).toContain('silk');
    expect(ladder[0]).toContain('outfit');
  });
});
