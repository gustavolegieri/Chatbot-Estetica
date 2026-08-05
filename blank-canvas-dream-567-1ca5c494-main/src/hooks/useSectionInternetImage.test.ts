import { describe, it, expect } from 'vitest';
import { shouldReuseSectionImageRow } from './useSectionInternetImage';

describe('shouldReuseSectionImageRow', () => {
  it('rejects legacy rows that have no concrete generation metadata', () => {
    const row = {
      signature_style: 'classic',
      signature_color: 'camel',
      signature_fabric: 'silk',
      query_used: null,
      validation_reason: null,
    };

    expect(shouldReuseSectionImageRow(row, { styleFrag: 'classic', colorFrag: 'camel', fabricFrag: 'silk' })).toBe(false);
  });

  it('accepts rows generated with semantic real-photo validation', () => {
    const row = {
      signature_style: 'classic',
      signature_color: 'camel',
      signature_fabric: 'silk',
      query_used: 'look classic camel silk woman fashion product shot isolated white background',
      validation_reason: 'semantic-v9 pixel-color-v6 pexels real-photo validation',
    };

    expect(shouldReuseSectionImageRow(row, { styleFrag: 'classic', colorFrag: 'camel', fabricFrag: 'silk' })).toBe(true);
  });
});
