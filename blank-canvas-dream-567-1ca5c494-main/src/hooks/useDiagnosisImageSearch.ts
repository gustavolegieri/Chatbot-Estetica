// EST ELITE — Hook para buscar imagens baseadas em diagnóstico
// Usa a edge function diagnosis-image-search para integrar múltiplos provedores
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DiagnosisImageSearchParams {
  diagnosisId: string;
  questionnaire?: Record<string, unknown>;
  colorAnalysis?: Record<string, unknown>;
  styleAnalysis?: Record<string, unknown>;
  skinTone?: string;
  section?: string;
  pieceName?: string;
  category?: string;
  seed?: number;
  mode?: 'product' | 'editorial';
  excludeUrls?: string[];
  excludeTerms?: string[];
  requiredTerms?: string[];
  requiredColorTerms?: string[];
  requiredFabricTerms?: string[];
  alternateQueries?: string[];
  query?: string;
  assetIdentity?: string;
}

export interface DiagnosisImageSearchResult {
  imageUrl: string | null;
  provider: string;
  queryUsed: string;
  colorUsed: string | null;
  section: string;
  pieceName: string | null;
  category: string | null;
  mode: string;
  poolSize: number;
  diagnosisId: string;
  message?: string;
  triedProviders?: string[];
  semanticValidated?: boolean;
  semanticScore?: number;
  matchedTerms?: string[];
  matchedColorTerms?: string[];
  matchedFabricTerms?: string[];
  photoVerified?: boolean;
  contentType?: string | null;
  colorPixelValidated?: boolean;
  colorCoverage?: number;
  colorComponentCoverage?: number;
  sampledColor?: string | null;
}

const requestCache = new Map<string, DiagnosisImageSearchResult>();
const requestInFlight = new Map<string, Promise<DiagnosisImageSearchResult | null>>();
const MAX_IMAGE_SEARCH_CONCURRENCY = 3;
let activeImageSearches = 0;
const imageSearchQueue: Array<() => void> = [];
const DIRECT_IMAGE_PROVIDERS = [
  'pexels-search-image',
  'duckduckgo-search-image',
  'unsplash-search-image',
  'pixabay-search-image',
] as const;

const SECTION_SEARCH_TERMS: Record<string, string> = {
  corpo: 'women body shape fashion styling',
  cores: 'women fashion color palette outfit',
  estilo: 'women personal style fashion editorial',
  movimento: 'women fashion outfit movement editorial',
  modelagens: 'women garment tailoring fit fashion',
  essenciais: 'women capsule wardrobe essentials',
  capsula: 'women capsule wardrobe coordinated outfits',
  paleta: 'women clothing color palette flat lay',
};

let brokerUnavailable = false;

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
}

function fieldValues(source: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!source) return [];
  return keys.flatMap((key) => stringValues(source[key]));
}

function uniqueWords(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const normalized = value.toLocaleLowerCase('pt-BR');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function buildProviderQuery(params: DiagnosisImageSearchParams): { query: string; color: string | null } {
  const questionnaire = params.questionnaire;
  const colorAnalysis = params.colorAnalysis;
  const styleAnalysis = params.styleAnalysis;
  const colors = uniqueWords([
    ...(params.requiredColorTerms || []),
    ...fieldValues(colorAnalysis, ['cores', 'cores_base', 'cores_destaque', 'paleta', 'estacao']),
    ...fieldValues(questionnaire, ['coresQueTeFazemBrilhar', 'coresPreferidas', 'colorPalette']),
  ]);
  const fabrics = uniqueWords([
    ...(params.requiredFabricTerms || []),
    ...fieldValues(questionnaire, ['tecidosPreferidos', 'tecidos', 'fabrics']),
  ]);
  const styles = uniqueWords([
    ...fieldValues(styleAnalysis, ['estilo', 'estiloPrincipal', 'estilo_personalidade', 'style']),
    ...fieldValues(questionnaire, ['estiloPersonalidade', 'estilo', 'style']),
  ]);
  const required = uniqueWords([
    ...(params.requiredTerms || []),
    params.pieceName || '',
    params.category || '',
  ]);
  const sectionTerm = SECTION_SEARCH_TERMS[params.section || ''] || 'women fashion editorial';
  const suffix = params.mode === 'product'
    ? 'women clothing product photo white background no person'
    : 'women fashion editorial photography';
  const query = uniqueWords([
    params.query || '',
    ...required.slice(0, 4),
    ...styles.slice(0, 2),
    ...colors.slice(0, 2),
    ...fabrics.slice(0, 1),
    sectionTerm,
    suffix,
  ]).join(' ').slice(0, 180).trim();
  return { query, color: colors[0] || null };
}

async function searchExistingProviders(params: DiagnosisImageSearchParams): Promise<DiagnosisImageSearchResult> {
  const { query, color } = buildProviderQuery(params);
  const triedProviders: string[] = [];
  const excluded = new Set((params.excludeUrls || []).map((value) => value.trim()).filter(Boolean));
  const seed = Number.isFinite(params.seed) ? Number(params.seed) : 0;
  const offset = Math.abs(seed) % DIRECT_IMAGE_PROVIDERS.length;
  const providers = [
    ...DIRECT_IMAGE_PROVIDERS.slice(offset),
    ...DIRECT_IMAGE_PROVIDERS.slice(0, offset),
  ];

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    triedProviders.push(provider);
    try {
      const { data, error } = await supabase.functions.invoke(provider, {
        body: {
          query,
          exclude_urls: [...excluded].slice(-120),
          exclude_terms: params.excludeTerms || [],
          seed: seed + index * 997,
          page: (Math.abs(seed) % 5) + 1,
          mode: params.mode || 'editorial',
          color,
        },
      });
      if (error) continue;
      const payload = data as Record<string, unknown> | null;
      const imageUrl = typeof payload?.imageUrl === 'string'
        ? payload.imageUrl
        : typeof payload?.image_url === 'string'
          ? payload.image_url
          : null;
      if (!imageUrl || excluded.has(imageUrl) || !/^https:\/\//i.test(imageUrl)) continue;

      return {
        imageUrl,
        provider,
        queryUsed: typeof payload?.queryUsed === 'string' ? payload.queryUsed : query,
        colorUsed: typeof payload?.colorUsed === 'string' ? payload.colorUsed : color,
        section: params.section || '',
        pieceName: params.pieceName || null,
        category: params.category || null,
        mode: params.mode || 'editorial',
        poolSize: typeof payload?.poolSize === 'number' ? payload.poolSize : 1,
        diagnosisId: params.diagnosisId,
        triedProviders,
        semanticValidated: false,
      };
    } catch {
      // Continue para o prÃ³ximo provedor remoto.
    }
  }

  return {
    imageUrl: null,
    provider: triedProviders[triedProviders.length - 1] || 'none',
    queryUsed: query,
    colorUsed: color,
    section: params.section || '',
    pieceName: params.pieceName || null,
    category: params.category || null,
    mode: params.mode || 'editorial',
    poolSize: 0,
    diagnosisId: params.diagnosisId,
    message: 'Nenhum dos provedores de imagem retornou uma foto vÃ¡lida.',
    triedProviders,
    semanticValidated: false,
  };
}

async function requestDiagnosisImage(params: DiagnosisImageSearchParams): Promise<DiagnosisImageSearchResult | null> {
  if (!brokerUnavailable) {
    const { data, error } = await supabase.functions.invoke<DiagnosisImageSearchResult>('diagnosis-image-search', {
      body: {
        diagnosisId: params.diagnosisId,
        questionnaire: params.questionnaire,
        colorAnalysis: params.colorAnalysis,
        styleAnalysis: params.styleAnalysis,
        skinTone: params.skinTone,
        section: params.section,
        pieceName: params.pieceName,
        category: params.category,
        seed: params.seed || 0,
        mode: params.mode || 'editorial',
        excludeUrls: params.excludeUrls || [],
        excludeTerms: params.excludeTerms || [],
        requiredTerms: params.requiredTerms || [],
        requiredColorTerms: params.requiredColorTerms || [],
        requiredFabricTerms: params.requiredFabricTerms || [],
        alternateQueries: params.alternateQueries || [],
        query: params.query,
        assetIdentity: params.assetIdentity,
      },
    });
    if (!error && data) return data;
    brokerUnavailable = true;
  }
  return searchExistingProviders(params);
}

function runNextImageSearch() {
  while (activeImageSearches < MAX_IMAGE_SEARCH_CONCURRENCY && imageSearchQueue.length > 0) {
    imageSearchQueue.shift()?.();
  }
}

function enqueueImageSearch<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    imageSearchQueue.push(() => {
      activeImageSearches += 1;
      void task().then(resolve, reject).finally(() => {
        activeImageSearches -= 1;
        runNextImageSearch();
      });
    });
    runNextImageSearch();
  });
}

export function useDiagnosisImageSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisImageSearchResult | null>(null);

  const searchImage = useCallback(async (params: DiagnosisImageSearchParams) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestKey = params.assetIdentity || JSON.stringify([
        params.diagnosisId, params.section, params.pieceName, params.category, params.query,
      ]);
      const memoryResult = requestCache.get(requestKey);
      const request = memoryResult
        ? Promise.resolve(memoryResult)
        : requestInFlight.get(requestKey) || enqueueImageSearch(async () => {
          const data = await requestDiagnosisImage(params);
          if (data?.imageUrl) requestCache.set(requestKey, data);
          return data;
        });
      if (!memoryResult && !requestInFlight.has(requestKey)) {
        requestInFlight.set(requestKey, request);
        void request.then(
          () => requestInFlight.delete(requestKey),
          () => requestInFlight.delete(requestKey),
        );
      }
      const data = await request;

      if (data) {
        setResult(data);
        
        if (!data.imageUrl) {
          console.warn('[useDiagnosisImageSearch] No image found:', data.message);
          setError(data.message || 'Nenhuma imagem encontrada');
        }
        
        return data;
      }

      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[useDiagnosisImageSearch] Error:', err);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    searchImage,
    loading,
    error,
    result,
    reset,
  };
}

// Hook simplificado para buscas automáticas baseadas em diagnóstico
export function useAutoDiagnosisImage(params: DiagnosisImageSearchParams) {
  const { searchImage, loading, error, result } = useDiagnosisImageSearch();

  // Auto-search quando params mudam (opcional)
  // Descomente se quiser busca automática
  /*
  useEffect(() => {
    if (params.diagnosisId) {
      searchImage(params);
    }
  }, [params.diagnosisId, params.section, params.pieceName]);
  */

  return {
    searchImage,
    loading,
    error,
    result,
  };
}
