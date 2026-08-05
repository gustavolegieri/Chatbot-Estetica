import { describe, expect, it } from 'vitest';
import { buildDiagnosticImageContract, isVerifiedRealPhotoResult } from './diagnosticImageContract';

describe('diagnosticImageContract', () => {
  it('uses leather from a flat loafer description instead of matching wool inside flat', () => {
    const contract = buildDiagnosticImageContract({
      diagnosisId: 'diag-1',
      section: 'capsula',
      pieceName: 'mocassim flat confortavel em couro macio navy claro',
      category: 'calcados',
      color: 'navy',
      fabric: 'wool',
      mode: 'product',
    });

    expect(contract.normalizedFabric).toBe('couro');
    expect(contract.query).toContain('leather');
    expect(contract.query).not.toContain('wool');
    expect(contract.normalizedColor).toBe('azul-médio');
    expect(contract.requiredColorTerms).toContain('blue');
    expect(contract.requiredColorTerms).not.toContain('navy');
  });

  it('normalizes a garment into subject, color, fabric and real-photo terms', () => {
    const result = buildDiagnosticImageContract({
      diagnosisId: 'diag-1',
      section: 'capsula',
      pieceName: 'jaqueta utilitária com bolsos em sarja stonewashed verde-folha',
      category: 'tercas_pecas',
      style: 'elegante',
      color: 'coral',
      fabric: 'linho',
      mode: 'product',
    });
    expect(result.query).toContain('leaf green');
    expect(result.query).toContain('twill');
    expect(result.query).toContain('women utility jacket');
    expect(result.query).toContain('real clothing product photo');
    expect(result.requiredTerms).toContain('utility jacket');
    expect(result.requiredColorTerms).toContain('leaf green');
    expect(result.requiredFabricTerms).toContain('twill');
    expect(result.query).not.toMatch(/illustration|drawing|cartoon|generated/i);
  });

  it('uses a collared-shirt contract that cannot be satisfied by a t-shirt term', () => {
    const result = buildDiagnosticImageContract({
      diagnosisId: 'diag-shirt', section: 'essenciais', pieceName: 'camisa de popeline azul',
      category: 'tops', mode: 'product',
    });
    expect(result.query).toContain('button up collared shirt');
    expect(result.requiredTerms).toContain('collared shirt');
    expect(result.requiredTerms).not.toContain('shirt');
  });

  it('uses a different cache identity for different wardrobe pieces', () => {
    const base = { diagnosisId: 'diag-1', section: 'capsula', category: 'tops', mode: 'product' as const };
    const top = buildDiagnosticImageContract({ ...base, pieceName: 'regata modal turquesa' });
    const jeans = buildDiagnosticImageContract({ ...base, pieceName: 'jeans mom algodão amarelo vivo' });
    expect(top.identity).not.toBe(jeans.identity);
    expect(top.query).toContain('turquoise');
    expect(jeans.query).toContain('bright yellow');
  });

  it('reuses the validated photo when the same piece appears in another section', () => {
    const essentials = buildDiagnosticImageContract({ diagnosisId: 'd1', section: 'essenciais', tileIndex: 0, pieceName: 'saia midi turquesa', category: 'bottoms' });
    const capsule = buildDiagnosticImageContract({ diagnosisId: 'd1', section: 'capsula', tileIndex: 4, pieceName: 'saia midi turquesa', category: 'bottoms' });
    expect(essentials.identity).toBe(capsule.identity);
    expect(essentials.identity).toContain('real-v26-');
  });

  it('accepts only semantically validated raster photographs', () => {
    expect(isVerifiedRealPhotoResult({
      imageUrl: 'https://cdn.example.com/loafer.webp',
      semanticValidated: true,
      semanticScore: 92,
      photoVerified: true,
      contentType: 'image/webp',
      colorPixelValidated: true,
    }, 'product')).toBe(true);
    expect(isVerifiedRealPhotoResult({
      imageUrl: 'https://cdn.example.com/loafer.svg',
      semanticValidated: true,
      semanticScore: 100,
      photoVerified: true,
      contentType: 'image/svg+xml',
      colorPixelValidated: true,
    }, 'product')).toBe(false);
    expect(isVerifiedRealPhotoResult({
      imageUrl: 'https://cdn.example.com/random.jpg',
      semanticValidated: false,
      semanticScore: 0,
      photoVerified: true,
      contentType: 'image/jpeg',
      colorPixelValidated: true,
    }, 'product')).toBe(false);
  });

  it('never classifies calcados as calca and recognizes a mule slingback', () => {
    const result = buildDiagnosticImageContract({
      diagnosisId: 'diag-shoe',
      section: 'essenciais',
      pieceName: 'mule slingback de couro nappa amarelo vivo',
      category: 'calcados',
      mode: 'product',
    });
    expect(result.normalizedCategory).toBe('footwear');
    expect(result.query).toContain('mule slingback shoes');
    expect(result.query).not.toContain('trousers');
  });

  it('maps burnt-orange suede loafers to the warm catalog color family', () => {
    const result = buildDiagnosticImageContract({
      diagnosisId: 'diag-burnt-orange-shoe',
      section: 'capsula',
      pieceName: 'loafer com recorte alto em camurça premium laranja queimado',
      category: 'calcados',
      style: 'Natural',
      mode: 'product',
    });

    expect(result.normalizedCategory).toBe('footwear');
    expect(result.normalizedColor).toBe('laranja-queimado');
    expect(result.query).toContain('burnt orange women loafers suede');
    expect(result.requiredColorTerms).toEqual(expect.arrayContaining(['burnt orange', 'orange', 'cognac', 'brown']));
    expect(result.requiredFabricTerms).toContain('suede');
  });

  it('replaces an explicitly avoided piece color with the allowed palette color', () => {
    const result = buildDiagnosticImageContract({
      diagnosisId: 'diag-color',
      section: 'capsula',
      pieceName: 'mule slingback de couro amarelo vivo',
      category: 'footwear',
      color: 'turquesa',
      excludedColors: ['amarelo'],
      mode: 'product',
    });
    expect(result.normalizedColor).toBe('turquesa');
    expect(result.query).toContain('turquoise');
    expect(result.query).not.toContain('bright yellow');
  });
});
