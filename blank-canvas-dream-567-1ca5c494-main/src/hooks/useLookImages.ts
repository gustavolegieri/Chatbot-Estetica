import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type LookImagesMap = Record<string, string>;

type SnapshotLookImage = {
  look_name?: unknown;
  image_url?: unknown;
};

/**
 * Loads all look_images for a diagnosis in a single query.
 * Returns a map of look_name → image_url.
 */
function mapRowsToLookImages(rows: SnapshotLookImage[] | null | undefined): LookImagesMap {
  const map: LookImagesMap = {};
  for (const row of rows || []) {
    const name = typeof row.look_name === 'string' ? row.look_name : '';
    const imageUrl = typeof row.image_url === 'string' ? row.image_url : '';
    if (name && imageUrl) map[name] = imageUrl;
  }
  return map;
}

export function useLookImages(
  diagnosisId: string | undefined,
  refreshKey?: unknown,
  snapshotRows?: SnapshotLookImage[] | null,
): { lookImagesMap: LookImagesMap; isLoading: boolean } {
  const [lookImagesMap, setLookImagesMap] = useState<LookImagesMap>({});
  const [isLoading, setIsLoading] = useState(Boolean(diagnosisId));
  const lastFetchedId = useRef<string | null>(null);

  useEffect(() => {
    if (!diagnosisId || !snapshotRows) return;
    setLookImagesMap(mapRowsToLookImages(snapshotRows));
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
      .from('look_images')
      .select('look_name, image_url')
      .eq('diagnosis_id', diagnosisId)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading look images:', error);
          setIsLoading(false);
          return;
        }
        setLookImagesMap(mapRowsToLookImages(data || []));
        setIsLoading(false);
      });
  }, [diagnosisId, refreshKey, snapshotRows]);

  return { lookImagesMap, isLoading };
}
