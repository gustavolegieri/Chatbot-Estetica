import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parsePiece, buildStoreQuery, type DiagnosisProfile } from '@/lib/pieceShopping';

export interface RealProduct {
  storeKey: string;
  storeName: string;
  title: string;
  productUrl: string;
  description?: string;
  score: number;
}

const REAL_STORES = ['amazon', 'shopee', 'mercadolivre', 'shein'] as const;

const memoryCache = new Map<string, RealProduct[]>();

/**
 * Phase-2 real-product fetch via Firecrawl edge function.
 * Returns 1 best product per store (Amazon, Shopee, ML, SHEIN).
 * Stores without a valid match are simply omitted.
 */
export function useFashionRealProducts(piece: string, profile: DiagnosisProfile) {
  const [products, setProducts] = useState<RealProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!piece) return;
    const tags = parsePiece(piece);
    const queries: Record<string, string> = {};
    for (const k of REAL_STORES) {
      queries[k] = buildStoreQuery(k, tags, piece, profile);
    }
    const cacheKey = `${tags.category}::${JSON.stringify(queries)}`;

    if (memoryCache.has(cacheKey)) {
      setProducts(memoryCache.get(cacheKey)!);
      return;
    }
    if (fetchedRef.current === cacheKey) return;
    fetchedRef.current = cacheKey;

    setLoading(true);
    setError(null);
    supabase.functions
      .invoke('fashion-search-products', {
        body: { piece, category: tags.category, queries },
      })
      .then(({ data, error: err }) => {
        if (err) throw err;
        const list = (data?.products ?? []) as RealProduct[];
        memoryCache.set(cacheKey, list);
        setProducts(list);
      })
      .catch((e) => {
        console.warn('[useFashionRealProducts]', e);
        setError(String(e));
        setProducts([]);
      })
      .finally(() => setLoading(false));
  }, [piece, profile]);

  return { products, loading, error };
}
