import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
// normalizeToken CANÔNICO — mesma função usada por useAutoImage e pelo
// backend `search-clothing-image`. Manter alinhado com src/lib/pieceKey.ts.
import { normalizeToken } from '@/lib/pieceKey';

export type ImagesMap = Map<string, string>;

type SnapshotClothingImage = {
  piece_key?: unknown;
  normalized_key?: unknown;
  image_url?: unknown;
};

/**
 * Loads clothing_images for THIS diagnosis only.
 * Images are no longer shared globally — each diagnosis gets its own set.
 */
function mapRowsToImagesMap(rows: SnapshotClothingImage[] | null | undefined): ImagesMap {
  const map = new Map<string, string>();
  for (const row of rows || []) {
    const imageUrl = typeof row.image_url === 'string' ? row.image_url : '';
    if (!imageUrl) continue;
    [row.normalized_key, row.piece_key].forEach((value) => {
      const normalizedKey = normalizeToken(typeof value === 'string' ? value : String(value || ''));
      if (normalizedKey) map.set(normalizedKey, imageUrl);
    });
    const pieceKeyPrefix = String(row.piece_key || '').split('__')[0];
    const prefixKey = normalizeToken(pieceKeyPrefix);
    if (prefixKey) map.set(prefixKey, imageUrl);
  }
  return map;
}

export function useDiagnosisImages(
  diagnosisId: string | undefined,
  _pieceNames?: string[],
  refreshKey?: unknown,
  snapshotRows?: SnapshotClothingImage[] | null,
): { imagesMap: ImagesMap; isLoading: boolean } {
  const [imagesMap, setImagesMap] = useState<ImagesMap>(new Map());
  const [isLoading, setIsLoading] = useState(Boolean(diagnosisId));
  const lastFetchedId = useRef<string | null>(null);

  useEffect(() => {
    if (!diagnosisId || !snapshotRows) return;
    setImagesMap(mapRowsToImagesMap(snapshotRows));
    setIsLoading(false);
    lastFetchedId.current = `${diagnosisId}:snapshot`;
  }, [diagnosisId, snapshotRows]);

  useEffect(() => {
    if (snapshotRows) return;
    const fetchKey = diagnosisId ? `${diagnosisId}:${String(refreshKey ?? 'initial')}` : null;
    if (!diagnosisId || !fetchKey || lastFetchedId.current === fetchKey) return;
    lastFetchedId.current = fetchKey;

    setIsLoading(true);

    supabase
      .from('clothing_images')
      .select('piece_key, normalized_key, image_url, prompt_used, category, color, fabric, style')
      .eq('diagnosis_id', diagnosisId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading diagnosis images:', error);
          setIsLoading(false);
          return;
        }
        setImagesMap(mapRowsToImagesMap(data || []));
        setIsLoading(false);
      });
  }, [diagnosisId, refreshKey, snapshotRows]);

  return { imagesMap, isLoading };
}
