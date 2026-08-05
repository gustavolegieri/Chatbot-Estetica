import { useMemo } from 'react';

/**
 * Category-based icon mapping for clothing items.
 * Instead of fetching from external APIs, we use elegant
 * inline placeholders based on the clothing category.
 */

const categoryKeywords: [string[], string][] = [
  [['blazer', 'jaqueta', 'casaco', 'trench', 'colete', 'cardigan'], '🧥'],
  [['camisa', 'blusa', 'camiseta', 'top', 'regata', 'body', 'cropped', 'suéter', 'tricot', 'moletom'], '👚'],
  [['calça', 'legging', 'shorts', 'bermuda'], '👖'],
  [['saia'], '🩱'],
  [['vestido', 'macacão', 'macaquinho'], '👗'],
  [['scarpin', 'sapato', 'sandália', 'tênis', 'bota', 'rasteirinha', 'mocassim', 'sapatilha', 'mule', 'havaiana', 'havaianas'], '👠'],
  [['bolsa', 'clutch', 'mochila'], '👜'],
  [['cinto', 'lenço', 'cachecol', 'chapéu', 'echarpe'], '🎀'],
  [['brinco', 'colar', 'pulseira', 'anel'], '💍'],
  [['óculos'], '🕶️'],
];

function getCategoryEmoji(description: string): string {
  const lower = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [keywords, emoji] of categoryKeywords) {
    for (const kw of keywords) {
      const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedKw)) return emoji;
    }
  }
  return '✨';
}

export { getCategoryEmoji };

/** Single item — returns empty string (no external image) */
export function useClothingImage(_description: string | undefined): string {
  return '';
}

/** Batch version — returns empty map (no external images) */
export function useClothingImages(_descriptions: string[]): Map<string, string> {
  return useMemo(() => new Map<string, string>(), []);
}
