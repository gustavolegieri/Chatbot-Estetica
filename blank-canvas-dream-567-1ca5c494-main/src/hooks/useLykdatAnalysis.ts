import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LykdatResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function useLykdatAnalysis() {
  const [data, setData] = useState<LykdatResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (imageUrl: string) => {
    setIsLoading(true);
    setError(null);
    setData(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        'lykdat-analyze-image',
        { body: { image_url: imageUrl } }
      );

      if (fnError) throw fnError;

      if (result?.error) {
        throw new Error(result.error);
      }

      setData(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar imagem';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, analyze };
}
