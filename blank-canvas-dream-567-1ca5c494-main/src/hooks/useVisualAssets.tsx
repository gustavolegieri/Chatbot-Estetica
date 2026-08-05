import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSectionImagesContext } from '@/contexts/SectionImagesContext';
import type { SectionId } from '@/lib/imageService';

const cache = new Map<string, string>();

export function useVisualAsset(category: string, value: string | undefined): string {
  const [url, setUrl] = useState<string>('/assets/default.jpg');

  useEffect(() => {
    if (!value) { setUrl('/assets/default.jpg'); return; }
    const key = `${category}:${value}`;
    if (cache.has(key)) { setUrl(cache.get(key)!); return; }

    supabase
      .from('analysis_visual_assets')
      .select('image_url')
      .eq('category', category)
      .eq('value', value)
      .maybeSingle()
      .then(({ data }) => {
        const resolved = data?.image_url || '/assets/default.jpg';
        cache.set(key, resolved);
        setUrl(resolved);
      });
  }, [category, value]);

  return url;
}

/**
 * Legacy helper used by some components. Returns the server-stored image URL
 * if available, otherwise a fallback editorial asset. New code should use
 * <SmartSectionImage /> instead, which uses diagnosis-scoped Pollinations images.
 */
export function useSectionImage(section: SectionId | string): string {
  const { imagesMap } = useSectionImagesContext();
  const personalized = imagesMap?.[section];
  if (personalized) return personalized;
  return `/assets/editorial/${section}.jpg`;
}
