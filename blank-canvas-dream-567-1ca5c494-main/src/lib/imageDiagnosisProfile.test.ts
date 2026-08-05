import { describe, expect, it } from 'vitest';
import { getDiagnosisImageProfile } from './imageDiagnosisProfile';
import { buildPieceQuery } from './pieceFragments';

describe('getDiagnosisImageProfile', () => {
  it('prioriza o questionário para cor, tecido, estilo e paleta', () => {
    const profile = getDiagnosisImageProfile({
      diagnosisId: 'diag-test',
      colorAnalysis: { cores: 'analise de cor' },
      styleAnalysis: { estiloPersonalidade: 'clássico' },
      questionnaire: {
        coresQueAma: 'verde esmeralda',
        tecidosPreferidos: ['seda', 'linho'],
        psicometrico: { paleta: 'paleta_fria', estilo: 'elegante' },
        paletaPreferida: 'paleta_fria',
      },
      skinTone: 'frio',
    });

    expect(profile.colorEN).toBe('emerald');
    expect(profile.fabricEN).toBe('silk');
    expect(profile.styleEN).toBe('elegant');
    expect(profile.paletteLabelEN).toContain('winter');
  });

  it('monta queries de peça alinhadas ao perfil do questionário', () => {
    const profile = getDiagnosisImageProfile({
      diagnosisId: 'diag-test-piece',
      questionnaire: {
        coresQueAma: 'verde esmeralda',
        tecidosPreferidos: ['seda', 'linho'],
      },
    });

    const pieceQuery = buildPieceQuery('blusa drapeada', null, 'tops', null, profile);

    expect(pieceQuery.query).toContain('seda');
    expect(pieceQuery.query).toContain('verde esmeralda');
    expect(pieceQuery.query).toContain('feminina moda');
  });
});
