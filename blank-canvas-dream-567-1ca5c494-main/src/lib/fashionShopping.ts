import { supabase } from '@/integrations/supabase/client';

export interface FashionProduct {
  id: string;
  name: string;
  category: string;
  style: string[];
  body_type: string[];
  color_palette: string[];
  occasion: string[];
  budget: string;
  store: string;
  is_reference: boolean;
  price_cents: number;
  image_url: string | null;
  affiliate_url: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export const SUPPORTED_STORES = [
  'SHEIN',
  'Shopee',
  'Amazon',
  'Dafiti',
  'Renner',
  'AliExpress',
  'Zara',
  'C&A',
] as const;

export const REFERENCE_ONLY_STORES = new Set(['Zara', 'C&A']);

export const PRODUCT_CATEGORIES = [
  'blazer',
  'camisa',
  'camiseta',
  'blusa',
  'vestido',
  'calca',
  'saia',
  'shorts',
  'casaco',
  'jaqueta',
  'tenis',
  'sapato',
  'bota',
  'bolsa',
  'acessorio',
] as const;

export const BUDGET_OPTIONS = ['low', 'medium', 'high', 'premium'] as const;

export interface ShoppingTags {
  style: string[];
  bodyType: string[];
  palette: string[];
  occasion: string[];
  budget?: string;
  categories: string[];
}

function asLowerArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).toLowerCase().trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function pickFirstString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.toLowerCase().trim();
  }
  return null;
}

export function extractShoppingTags(diagnosis: {
  body_analysis?: Record<string, unknown> | null;
  color_analysis?: Record<string, unknown> | null;
  style_analysis?: Record<string, unknown> | null;
  capsule_wardrobe?: Record<string, unknown> | null;
  wardrobe_essentials?: Record<string, unknown> | null;
  questionnaire?: Record<string, unknown> | null;
}): ShoppingTags {
  const body = diagnosis.body_analysis || {};
  const color = diagnosis.color_analysis || {};
  const style = diagnosis.style_analysis || {};
  const q = diagnosis.questionnaire || {};

  const bodyType = [
    pickFirstString(body as Record<string, unknown>, ['tipo_corporal', 'body_type', 'silhueta', 'biotipo']),
  ].filter(Boolean) as string[];

  const palette = [
    pickFirstString(color as Record<string, unknown>, ['paleta', 'palette', 'estacao', 'season', 'subtom']),
  ].filter(Boolean) as string[];

  const styleTags = [
    ...asLowerArray((style as Record<string, unknown>).estilos_predominantes),
    ...asLowerArray((style as Record<string, unknown>).estilo_principal),
    ...asLowerArray((style as Record<string, unknown>).palavras_chave),
  ];

  const occasion = [
    ...asLowerArray((q as Record<string, unknown>).ocasiao),
    ...asLowerArray((q as Record<string, unknown>).profissao),
  ];

  const budget = pickFirstString(q as Record<string, unknown>, ['budget', 'orcamento']) || undefined;

  const categories = extractCategoriesFromCapsule(diagnosis.capsule_wardrobe, diagnosis.wardrobe_essentials);

  return { style: styleTags, bodyType, palette, occasion, budget, categories };
}

function extractCategoriesFromCapsule(
  capsule: Record<string, unknown> | null | undefined,
  essentials: Record<string, unknown> | null | undefined
): string[] {
  const cats = new Set<string>();
  const cap = capsule?.['pecas_capsula'] as Record<string, unknown> | undefined;
  if (cap) {
    Object.keys(cap).forEach((k) => cats.add(k.toLowerCase()));
  }
  // crude category guessing from essentials text
  const ess = essentials?.['pecas_essenciais'] || essentials?.['essenciais'];
  if (Array.isArray(ess)) {
    ess.forEach((item) => {
      const text = typeof item === 'string' ? item : (item as Record<string, unknown>)?.nome;
      if (typeof text === 'string') {
        const lower = text.toLowerCase();
        PRODUCT_CATEGORIES.forEach((c) => {
          if (lower.includes(c)) cats.add(c);
        });
      }
    });
  }
  return [...cats];
}

export interface MatchOptions {
  limit?: number;
  pieceHint?: string;
}

/**
 * Fetch products matching diagnosis tags with progressive fallback.
 * Returns { products, exact } — exact=false signals fallback to broader catalog.
 */
export async function matchProducts(
  tags: ShoppingTags,
  opts: MatchOptions = {}
): Promise<{ products: FashionProduct[]; exact: boolean }> {
  const limit = opts.limit ?? 24;

  // Pass 1: tag overlap (exact match)
  const orParts: string[] = [];
  if (tags.style.length) orParts.push(`style.ov.{${tags.style.join(',')}}`);
  if (tags.bodyType.length) orParts.push(`body_type.ov.{${tags.bodyType.join(',')}}`);
  if (tags.palette.length) orParts.push(`color_palette.ov.{${tags.palette.join(',')}}`);
  if (tags.categories.length) orParts.push(`category.in.(${tags.categories.join(',')})`);

  if (orParts.length) {
    let q = supabase.from('fashion_products').select('*').eq('active', true).or(orParts.join(','));
    if (opts.pieceHint) q = q.ilike('name', `%${opts.pieceHint}%`);
    const { data } = await q.order('price_cents', { ascending: true }).limit(limit);
    if (data && data.length > 0) return { products: data as FashionProduct[], exact: true };
  }

  // Pass 2: category-only fallback
  if (tags.categories.length) {
    const { data } = await supabase
      .from('fashion_products')
      .select('*')
      .eq('active', true)
      .in('category', tags.categories)
      .order('price_cents', { ascending: true })
      .limit(limit);
    if (data && data.length > 0) return { products: data as FashionProduct[], exact: false };
  }

  // Pass 3: any active products
  const { data } = await supabase
    .from('fashion_products')
    .select('*')
    .eq('active', true)
    .order('price_cents', { ascending: true })
    .limit(limit);
  return { products: (data as FashionProduct[]) || [], exact: false };
}

export async function trackProductClick(params: {
  productId: string;
  diagnosisId?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('fashion_affiliate_clicks').insert({
      product_id: params.productId,
      user_id: user?.id ?? null,
      diagnosis_id: params.diagnosisId ?? null,
    });
  } catch (err) {
    console.warn('[fashionShopping] click tracking failed', err);
  }
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function isReferenceStore(store: string): boolean {
  return REFERENCE_ONLY_STORES.has(store);
}
