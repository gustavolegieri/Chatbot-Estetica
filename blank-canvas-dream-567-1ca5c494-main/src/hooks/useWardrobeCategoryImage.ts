import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Le a imagem já persistida por `generate-section-images` (content_type wardrobe_category)
// A chave é sempre `wardrobe_<catKey>` onde catKey ∈ tops_blusas, calcas_saias, calcados, vestidos, terceiras_pecas.

// Mapeia catKey do frontend (usado em CapsuleSection) → catKey persistido no banco.
const CAT_KEY_MAP: Record<string, string> = {
  tops: 'tops_blusas',
  bottoms: 'calcas_saias',
  vestidos: 'vestidos',
  tercas_pecas: 'terceiras_pecas',
  calcados: 'calcados',
};

const cache = new Map<string, Promise<Record<string, string>>>();

async function loadWardrobeImages(diagnosisId: string): Promise<Record<string, string>> {
  const existing = cache.get(diagnosisId);
  if (existing) return existing;
  const p = (async () => {
    const { data, error } = await supabase
      .from('diagnosis_section_images')
      .select('section, image_url')
      .eq('diagnosis_id', diagnosisId)
      .like('section', 'wardrobe_%');
    if (error) { console.warn('[wardrobe-image] db error', error.message); return {}; }
    const map: Record<string, string> = {};
    for (const row of data || []) {
      if (row?.section && row?.image_url) map[row.section] = row.image_url;
    }
    return map;
  })();
  cache.set(diagnosisId, p);
  return p;
}

export function useWardrobeCategoryImage(diagnosisId: string | undefined, frontendCatKey: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(diagnosisId));

  useEffect(() => {
    if (!diagnosisId || !frontendCatKey) { setUrl(null); setLoading(false); return; }
    const dbKey = `wardrobe_${CAT_KEY_MAP[frontendCatKey] || frontendCatKey}`;
    let cancelled = false;
    setLoading(true);
    loadWardrobeImages(diagnosisId).then((map) => {
      if (cancelled) return;
      setUrl(map[dbKey] || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [diagnosisId, frontendCatKey]);

  // Polling leve até 24s enquanto o motor ainda não escreveu
  useEffect(() => {
    if (!diagnosisId || !frontendCatKey || url) return;
    const dbKey = `wardrobe_${CAT_KEY_MAP[frontendCatKey] || frontendCatKey}`;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      cache.delete(diagnosisId);
      loadWardrobeImages(diagnosisId).then((map) => {
        const v = map[dbKey] || null;
        if (v) { setUrl(v); setLoading(false); clearInterval(t); }
        else if (tries >= 6) { setLoading(false); clearInterval(t); }
      });
    }, 4000);
    return () => clearInterval(t);
  }, [diagnosisId, frontendCatKey, url]);

  return { url, loading };
}
