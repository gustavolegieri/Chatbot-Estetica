import { describe, it, expect } from 'vitest';
import { buildSearchQueryForContext, extractProviderImageResult, getProviderOrder, isTrustedImageUrl } from './useAutoImage';

describe('getProviderOrder', () => {
  it('usa Pexels como provedor principal', () => {
    const order = getProviderOrder(7, 'default');
    expect(order[0]).toBe('pexels-search-image');
    expect(order).toContain('pexels-search-image');
  });

  it('não usa Unsplash nem outros provedores no modo Pexels-only', () => {
    const order = getProviderOrder(7, 'pexelsOnly');
    expect(order).toEqual(['pexels-search-image']);
  });
});

describe('isTrustedImageUrl', () => {
  it('aceita URLs confiáveis do Pexels e rejeita URLs de outros provedores', () => {
    expect(isTrustedImageUrl('https://images.pexels.com/photo-123', 'pexels-search-image')).toBe(true);
    expect(isTrustedImageUrl('https://images.unsplash.com/photo-123', 'pexels-search-image')).toBe(false);
    expect(isTrustedImageUrl('https://images.pexels.com/photo-123', 'unsplash-search-image')).toBe(false);
  });
});

describe('buildSearchQueryForContext', () => {
  it('torna a query mais específica para peça isolada sem pessoa', () => {
    const query = buildSearchQueryForContext('black blazer', true);
    expect(query).toContain('isolated');
    expect(query).toContain('no person');
  });
});

describe('extractProviderImageResult', () => {
  it('preserva uma URL válida mesmo quando o SDK sinaliza um erro wrapper', () => {
    const result = {
      data: {
        imageUrl: 'https://images.unsplash.com/photo-123',
        providerStatus: 200,
      },
      error: new Error('edge function returned a non-2xx status code'),
    };

    const extracted = extractProviderImageResult(result as any);
    expect(extracted.imageUrl).toBe('https://images.unsplash.com/photo-123');
    expect(extracted.providerStatus).toBe(200);
  });
});
