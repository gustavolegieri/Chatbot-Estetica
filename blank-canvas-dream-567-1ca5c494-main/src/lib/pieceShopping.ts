// Instant piece-to-product engine: parses AI-generated piece descriptions
// and generates affiliate search-link "products" across multiple stores,
// with deterministic compatibility scoring derived from the diagnosis.

import { supabase } from '@/integrations/supabase/client';

const AMAZON_TAG = (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined) || '';

export interface PieceTags {
  category: string;
  fit?: string;
  fabric?: string;
  color?: string;
  styleHint?: string;
}

export interface StoreDef {
  key: string;
  name: string;
  logo: string;
  category: 'fast-fashion' | 'marketplace' | 'departamento' | 'premium' | 'esportivo';
  trustScore: number; // 0-100
  hasAffiliate: boolean;
  websiteUrl: string; // official homepage fallback
  priceMin: number;
  priceMax: number;
  reference?: boolean;
  build: (q: string) => string;
}

export const STORES: StoreDef[] = [
  { key: 'shein', name: 'SHEIN', logo: '🛍️', category: 'fast-fashion', trustScore: 78, hasAffiliate: true, websiteUrl: 'https://br.shein.com/', priceMin: 30, priceMax: 150, build: (q) => `https://br.shein.com/pdsearch/${encodeURIComponent(q)}/` },
  { key: 'shopee', name: 'Shopee', logo: '🧡', category: 'marketplace', trustScore: 80, hasAffiliate: true, websiteUrl: 'https://shopee.com.br/', priceMin: 25, priceMax: 180, build: (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}` },
  { key: 'amazon', name: 'Amazon Fashion', logo: '📦', category: 'marketplace', trustScore: 92, hasAffiliate: true, websiteUrl: 'https://www.amazon.com.br/fashion', priceMin: 60, priceMax: 600, build: (q) => {
      const base = `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}&i=apparel`;
      return AMAZON_TAG ? `${base}&tag=${AMAZON_TAG}` : base;
    } },
  { key: 'mercadolivre', name: 'Mercado Livre Moda', logo: '💛', category: 'marketplace', trustScore: 88, hasAffiliate: true, websiteUrl: 'https://www.mercadolivre.com.br/c/moda', priceMin: 50, priceMax: 500, build: (q) => `https://lista.mercadolivre.com.br/moda/${encodeURIComponent(q)}` },
  { key: 'renner', name: 'Renner', logo: '🅡', category: 'departamento', trustScore: 94, hasAffiliate: false, websiteUrl: 'https://www.lojasrenner.com.br/', priceMin: 80, priceMax: 400, reference: true, build: (q) => `https://www.lojasrenner.com.br/busca?q=${encodeURIComponent(q)}` },
  { key: 'riachuelo', name: 'Riachuelo', logo: '🅡🅡', category: 'departamento', trustScore: 90, hasAffiliate: true, websiteUrl: 'https://www.riachuelo.com.br/', priceMin: 70, priceMax: 350, build: (q) => `https://www.riachuelo.com.br/busca?q=${encodeURIComponent(q)}` },
  { key: 'cea', name: 'C&A', logo: '🅒', category: 'departamento', trustScore: 89, hasAffiliate: false, websiteUrl: 'https://www.cea.com.br/', priceMin: 70, priceMax: 300, reference: true, build: (q) => `https://www.cea.com.br/busca?q=${encodeURIComponent(q)}` },
  { key: 'dafiti', name: 'Dafiti', logo: '👗', category: 'marketplace', trustScore: 86, hasAffiliate: false, websiteUrl: 'https://www.dafiti.com.br/', priceMin: 90, priceMax: 500, reference: true, build: (q) => `https://www.dafiti.com.br/catalog/?q=${encodeURIComponent(q)}` },
  { key: 'zattini', name: 'Zattini', logo: '👠', category: 'marketplace', trustScore: 84, hasAffiliate: true, websiteUrl: 'https://www.zattini.com.br/', priceMin: 80, priceMax: 450, build: (q) => `https://www.zattini.com.br/busca?q=${encodeURIComponent(q)}` },
  { key: 'amaro', name: 'Amaro', logo: '🤍', category: 'premium', trustScore: 91, hasAffiliate: true, websiteUrl: 'https://amaro.com/br/pt/', priceMin: 150, priceMax: 600, build: (q) => `https://amaro.com/br/pt/search?q=${encodeURIComponent(q)}` },
  { key: 'aliexpress', name: 'AliExpress', logo: '🌐', category: 'marketplace', trustScore: 75, hasAffiliate: true, websiteUrl: 'https://pt.aliexpress.com/', priceMin: 25, priceMax: 200, build: (q) => `https://pt.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}` },
  { key: 'zara', name: 'Zara', logo: '⬛', category: 'premium', trustScore: 95, hasAffiliate: false, websiteUrl: 'https://www.zara.com/br/', reference: true, priceMin: 200, priceMax: 900, build: (q) => `https://www.zara.com/br/pt/search?searchTerm=${encodeURIComponent(q)}` },
];

const STORE_BY_KEY = Object.fromEntries(STORES.map((s) => [s.key, s]));

// ------------------------- Piece parsing -------------------------

const CATEGORY_RULES: Array<{ keys: string[]; cat: string }> = [
  { keys: ['camiseta', 't-shirt', 'tshirt', 'baby look'], cat: 'camiseta' },
  { keys: ['regata', 'top cropped', 'cropped'], cat: 'top' },
  { keys: ['blusa', 'camisete', 'camisete'], cat: 'blusa' },
  { keys: ['camisa', 'camisão'], cat: 'camisa' },
  { keys: ['blazer'], cat: 'blazer' },
  { keys: ['casaco', 'sobretudo', 'trench'], cat: 'casaco' },
  { keys: ['jaqueta', 'jaquetinha'], cat: 'jaqueta' },
  { keys: ['vestido'], cat: 'vestido' },
  { keys: ['saia'], cat: 'saia' },
  { keys: ['short', 'bermuda'], cat: 'shorts' },
  { keys: ['pantacourt', 'pantalona', 'calça wide', 'calça reta', 'calça', 'jeans'], cat: 'calca' },
  { keys: ['tênis', 'tenis', 'sneaker'], cat: 'tenis' },
  { keys: ['sandália', 'sandalia', 'rasteira'], cat: 'sandalia' },
  { keys: ['scarpin', 'salto', 'sapato'], cat: 'sapato' },
  { keys: ['bota', 'coturno', 'ankle'], cat: 'bota' },
  { keys: ['bolsa', 'tote', 'mini bag', 'clutch'], cat: 'bolsa' },
  { keys: ['cinto'], cat: 'cinto' },
  { keys: ['lenço', 'echarpe', 'cachecol'], cat: 'acessorio' },
  { keys: ['óculos', 'oculos'], cat: 'oculos' },
];

const FIT_RULES: Array<{ keys: string[]; fit: string }> = [
  { keys: ['oversized', 'oversize'], fit: 'oversized' },
  { keys: ['slim', 'ajustado', 'justa', 'justo'], fit: 'slim' },
  { keys: ['wide', 'pantalona', 'ampla', 'amplo'], fit: 'wide' },
  { keys: ['reto', 'reta', 'straight'], fit: 'reta' },
  { keys: ['cropped'], fit: 'cropped' },
  { keys: ['midi'], fit: 'midi' },
  { keys: ['mini'], fit: 'mini' },
  { keys: ['longo', 'longa', 'maxi'], fit: 'longo' },
  { keys: ['cintura alta', 'high waist'], fit: 'cintura-alta' },
];

const FABRIC_RULES = [
  'algodão', 'algodao', 'linho', 'seda', 'tricot', 'malha', 'sarja',
  'denim', 'jeans', 'couro', 'veludo', 'cetim', 'crepe', 'tweed',
  'lã', 'la', 'viscose',
];

const COLOR_RULES = [
  'preto', 'branco', 'bege', 'caramelo', 'marrom', 'camel', 'nude',
  'cinza', 'azul', 'marinho', 'navy', 'verde', 'oliva', 'vermelho',
  'rosa', 'rosa velho', 'lilás', 'lilas', 'lavanda', 'amarelo', 'mostarda',
  'terracota', 'off-white', 'creme', 'vinho', 'bordô', 'bordo',
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parsePiece(text: string): PieceTags {
  const lower = ' ' + normalize(text) + ' ';
  let category = 'peca';
  for (const r of CATEGORY_RULES) {
    if (r.keys.some((k) => lower.includes(normalize(k)))) {
      category = r.cat;
      break;
    }
  }
  let fit: string | undefined;
  for (const r of FIT_RULES) {
    if (r.keys.some((k) => lower.includes(normalize(k)))) {
      fit = r.fit;
      break;
    }
  }
  const fabric = FABRIC_RULES.find((f) => lower.includes(normalize(f)));
  const color = COLOR_RULES.find((c) => lower.includes(normalize(c)));
  return { category, fit, fabric, color };
}

/**
 * Convert a verbose AI piece description into a SHORT commercial search query.
 * Keeps only buyable attributes: category + fit + fabric + color + "feminina".
 * Drops abstract diagnosis terms (palette name, body type, style archetype).
 *
 * Example:
 *   "Camiseta oversized em malha de algodão pesada com recorte assimétrico"
 *   -> "camiseta oversized algodão feminina"
 */
export function buildFashionSearchQuery(
  piece: string,
  tags?: PieceTags,
  _profile?: Partial<DiagnosisProfile>
): string {
  const t = tags ?? parsePiece(piece);
  const parts: string[] = [];
  if (t.category && t.category !== 'peca') parts.push(t.category);
  if (t.fit) parts.push(t.fit.replace('-', ' '));
  if (t.fabric) parts.push(t.fabric);
  if (t.color) parts.push(t.color);
  if (parts.length === 0) {
    parts.push(...piece.split(/\s+/).slice(0, 3));
  }
  parts.push('feminina');
  const seen = new Set<string>();
  const final: string[] = [];
  for (const p of parts) {
    const k = normalize(String(p));
    if (k && !seen.has(k)) {
      seen.add(k);
      final.push(String(p));
      if (final.length >= 5) break;
    }
  }
  return final.join(' ');
}

export const buildSearchQuery = buildFashionSearchQuery;

/** Per-piece queries for each major store. Each value is a real search URL. */
export interface StoreQueries {
  amazon: string;
  shopee: string;
  mercadolivre: string;
  shein: string;
}

export function buildProductSearchQuery(
  piece: string,
  profile?: Partial<DiagnosisProfile>
): { query: string; storeQueries: StoreQueries } {
  const query = buildFashionSearchQuery(piece, undefined, profile);
  const enc = encodeURIComponent(query);
  return {
    query,
    storeQueries: {
      amazon: `https://www.amazon.com.br/s?k=${enc}`,
      shopee: `https://shopee.com.br/search?keyword=${enc}`,
      mercadolivre: `https://lista.mercadolivre.com.br/${enc}`,
      shein: `https://br.shein.com/pdsearch/${enc}`,
    },
  };
}

/** Used for the "Comprar look completo" CTA. Returns one search URL per piece. */
export function buildLookQuery(pieces: string[]): string {
  const cats: string[] = [];
  for (const p of pieces) {
    const t = parsePiece(p);
    if (t.category && t.category !== 'peca' && !cats.includes(t.category)) cats.push(t.category);
    if (cats.length >= 4) break;
  }
  return [...cats, 'feminina'].join(' ');
}

// ------------------------- Scoring -------------------------

export interface DiagnosisProfile {
  bodyType?: string;
  palette?: string;
  styles: string[];
  budget?: 'low' | 'medium' | 'high' | 'premium' | string;
}

// Deterministic 0-1 hash
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Compatibility 86-98% — pieces are AI-derived from the profile, so they
 *  are intrinsically compatible. Variation is deterministic per (piece, store). */
export function compatibilityScore(piece: string, storeKey: string, profile: DiagnosisProfile): number {
  const base = 86;
  const span = 12;
  const seed = `${piece}|${storeKey}|${profile.bodyType || ''}|${profile.palette || ''}`;
  return Math.round(base + hash01(seed) * span);
}

// ------------------------- Category pricing -------------------------

// Category buckets used for realistic price ranges (per store).
// Keys map from parsePiece() categories.
export type PriceBucket = 'camiseta' | 'calca' | 'blazer' | 'sapato' | 'vestido' | 'acessorio';

const CATEGORY_TO_BUCKET: Record<string, PriceBucket> = {
  camiseta: 'camiseta', top: 'camiseta', blusa: 'camiseta', camisa: 'camiseta',
  blazer: 'blazer', casaco: 'blazer', jaqueta: 'blazer',
  calca: 'calca', shorts: 'calca', saia: 'calca',
  vestido: 'vestido',
  tenis: 'sapato', sandalia: 'sapato', sapato: 'sapato', bota: 'sapato',
  bolsa: 'acessorio', cinto: 'acessorio', acessorio: 'acessorio', oculos: 'acessorio',
};

// Realistic ranges per (bucket, store). Stores not listed inherit from a peer.
const BUCKET_PRICES: Record<PriceBucket, Record<string, [number, number]>> = {
  camiseta: {
    shopee: [35, 90], shein: [45, 120], aliexpress: [25, 80], mercadolivre: [40, 110],
    cea: [59, 139], renner: [69, 149], riachuelo: [59, 139],
    dafiti: [79, 169], zattini: [69, 159], amazon: [49, 159],
    amaro: [129, 259], zara: [89, 179],
  },
  calca: {
    shopee: [70, 180], shein: [90, 220], aliexpress: [50, 160], mercadolivre: [80, 220],
    cea: [119, 249], renner: [149, 279], riachuelo: [129, 259],
    dafiti: [149, 329], zattini: [129, 299], amazon: [99, 299],
    amaro: [249, 499], zara: [199, 399],
  },
  blazer: {
    shopee: [120, 250], shein: [150, 320], aliexpress: [90, 240], mercadolivre: [140, 330],
    cea: [199, 449], renner: [249, 499], riachuelo: [219, 459],
    dafiti: [259, 599], zattini: [229, 519], amazon: [179, 549],
    amaro: [399, 899], zara: [299, 699],
  },
  sapato: {
    shopee: [60, 180], shein: [90, 240], aliexpress: [50, 160], mercadolivre: [80, 240],
    cea: [129, 329], renner: [159, 399], riachuelo: [139, 359],
    dafiti: [179, 499], zattini: [149, 449], amazon: [129, 449],
    amaro: [299, 699], zara: [229, 499],
  },
  vestido: {
    shopee: [80, 220], shein: [120, 280], aliexpress: [60, 200], mercadolivre: [100, 280],
    cea: [149, 349], renner: [179, 399], riachuelo: [159, 369],
    dafiti: [199, 499], zattini: [179, 449], amazon: [149, 449],
    amaro: [349, 799], zara: [199, 499],
  },
  acessorio: {
    shopee: [25, 90], shein: [29, 120], aliexpress: [15, 80], mercadolivre: [30, 140],
    cea: [49, 159], renner: [59, 199], riachuelo: [49, 179],
    dafiti: [69, 249], zattini: [59, 219], amazon: [39, 229],
    amaro: [149, 449], zara: [89, 299],
  },
};

export type PriceSource = 'real' | 'estimated';

export function getCategoryRange(
  storeKey: string,
  category: string
): { min: number; max: number; bucket: PriceBucket } {
  const bucket = CATEGORY_TO_BUCKET[category] ?? 'camiseta';
  const r = BUCKET_PRICES[bucket][storeKey] ?? BUCKET_PRICES[bucket].shopee;
  return { min: r[0], max: r[1], bucket };
}

// ------------------------- Product cards -------------------------

export interface PieceProduct {
  id: string;
  piece: string;
  title: string;
  storeKey: string;
  storeName: string;
  isReference: boolean;
  hasAffiliate: boolean;
  priceMin: number;
  priceMax: number;
  avgPrice: number;
  currency: 'BRL';
  priceSource: PriceSource;
  lastUpdated: string; // ISO
  affiliateUrl: string;
  websiteUrl: string;
  /** Resolved buy target: affiliate → website → null (disabled). */
  buyUrl: string | null;
  compatibility: number;
}

export interface BuildOptions {
  storesPerPiece?: number;
  excludeStores?: string[];
  budget?: string;
}

const BUDGET_TIERS: Record<string, string[]> = {
  low: ['shein', 'shopee', 'aliexpress', 'mercadolivre'],
  medium: ['shein', 'shopee', 'amazon', 'renner', 'riachuelo', 'cea', 'mercadolivre'],
  high: ['amazon', 'dafiti', 'zattini', 'renner', 'riachuelo', 'amaro', 'zara'],
  premium: ['zara', 'amaro', 'dafiti', 'renner'],
};

// ------- Store-specific query adaptation + irrelevant-result filtering -------

const EN_CATEGORY: Record<string, string> = {
  camiseta: 't-shirt', top: 'crop top', blusa: 'blouse', camisa: 'shirt',
  blazer: 'blazer', casaco: 'coat', jaqueta: 'jacket', vestido: 'dress',
  saia: 'skirt', shorts: 'shorts', calca: 'pants', tenis: 'sneakers',
  sandalia: 'sandals', sapato: 'heels', bota: 'boots', bolsa: 'bag',
  cinto: 'belt', acessorio: 'accessory', oculos: 'sunglasses',
};
const EN_FIT: Record<string, string> = {
  oversized: 'oversized', slim: 'slim fit', wide: 'wide leg', reta: 'straight',
  cropped: 'cropped', midi: 'midi', mini: 'mini', longo: 'maxi',
  'cintura-alta': 'high waist',
};
const EN_FABRIC: Record<string, string> = {
  algodao: 'cotton', 'algodão': 'cotton', linho: 'linen', seda: 'silk',
  malha: 'knit', tricot: 'knit', sarja: 'twill', denim: 'denim', jeans: 'denim',
  couro: 'leather', veludo: 'velvet', cetim: 'satin', viscose: 'viscose',
};
const EN_COLOR: Record<string, string> = {
  preto: 'black', branco: 'white', bege: 'beige', caramelo: 'caramel',
  marrom: 'brown', nude: 'nude', cinza: 'grey', azul: 'blue', marinho: 'navy',
  verde: 'green', oliva: 'olive', vermelho: 'red', rosa: 'pink',
  'rosa velho': 'dusty pink', lilas: 'lilac', 'lilás': 'lilac',
  amarelo: 'yellow', mostarda: 'mustard', terracota: 'terracotta',
  'off-white': 'off white', creme: 'cream', vinho: 'burgundy',
};

// Keywords that almost never belong to outerwear/looks. Used to avoid
// lingerie/socks/pajamas leaking into search results.
const IRRELEVANT_TERMS = ['calcinha', 'sutia', 'sutiã', 'lingerie', 'meia', 'cueca', 'pijama'];

const ALLOW_INTIMATE_CATEGORIES = new Set<string>([]); // none for now

function shouldExcludeIntimates(category: string): boolean {
  return !ALLOW_INTIMATE_CATEGORIES.has(category);
}

/** Per-store query: tone is adapted, and we append negative keywords on
 *  stores whose search engines respect them (Amazon, ML). */
export function buildStoreQuery(
  storeKey: string,
  tags: PieceTags,
  piece: string,
  profile?: Partial<DiagnosisProfile>
): string {
  const baseParts: string[] = [];
  const cat = tags.category && tags.category !== 'peca' ? tags.category : '';
  const fit = tags.fit ?? '';
  const fabric = tags.fabric ?? '';
  const color = tags.color ?? '';

  if (storeKey === 'shein' || storeKey === 'aliexpress') {
    // English fashion query
    if (EN_CATEGORY[cat]) baseParts.push(EN_CATEGORY[cat]);
    if (EN_FIT[fit]) baseParts.push(EN_FIT[fit]);
    if (EN_FABRIC[fabric]) baseParts.push(EN_FABRIC[fabric]);
    if (EN_COLOR[color]) baseParts.push(EN_COLOR[color]);
    baseParts.push('women');
  } else if (storeKey === 'amazon') {
    // Short, direct PT-BR
    if (cat) baseParts.push(cat);
    if (fit) baseParts.push(fit.replace('-', ' '));
    if (color) baseParts.push(color);
    baseParts.push('feminina');
  } else {
    // Shopee, ML, Renner, Riachuelo, C&A, Dafiti, Zattini, Amaro, Zara — PT-BR rich
    if (cat) baseParts.push(cat);
    if (fit) baseParts.push(fit.replace('-', ' '));
    if (fabric) baseParts.push(fabric);
    if (color) baseParts.push(color);
    baseParts.push('feminina');
  }

  if (baseParts.length <= 1) {
    baseParts.unshift(...piece.split(/\s+/).slice(0, 2));
  }

  // Dedupe
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of baseParts) {
    const k = normalize(String(p));
    if (k && !seen.has(k)) { seen.add(k); out.push(String(p)); }
    if (out.length >= 5) break;
  }

  // No negative operators — Amazon/Shopee/ML don't honor `-term` syntax.
  // Filtering of irrelevant results (lingerie, meia, pijama…) must happen
  // post-fetch via title blacklist + category whitelist (requires real product
  // data from a scraping backend; not applicable to pure search-link cards).
  return out.join(' ');
}

export function buildProductsForPiece(
  piece: string,
  profile: DiagnosisProfile,
  opts: BuildOptions = {}
): PieceProduct[] {
  const tags = parsePiece(piece);
  const limit = opts.storesPerPiece ?? 4;
  const now = new Date().toISOString();

  const allow = profile.budget && BUDGET_TIERS[profile.budget]
    ? new Set(BUDGET_TIERS[profile.budget])
    : null;

  const candidates = STORES
    .filter((s) => !opts.excludeStores?.includes(s.key))
    .filter((s) => !allow || allow.has(s.key) || s.reference)
    .map((s) => {
      const r = getCategoryRange(s.key, tags.category);
      return { s, r };
    })
    .sort((a, b) => {
      if (a.s.reference && !b.s.reference) return 1;
      if (!a.s.reference && b.s.reference) return -1;
      return a.r.min - b.r.min;
    })
    .slice(0, limit);

  return candidates.map(({ s, r }) => {
    const affiliateUrl = s.hasAffiliate ? s.build(buildStoreQuery(s.key, tags, piece, profile)) : '';
    const buyUrl = affiliateUrl || s.websiteUrl || null;
    return {
      id: `${s.key}::${piece}`,
      piece,
      title: piece,
      storeKey: s.key,
      storeName: s.name,
      isReference: !!s.reference,
      hasAffiliate: s.hasAffiliate,
      priceMin: r.min,
      priceMax: r.max,
      avgPrice: Math.round((r.min + r.max) / 2),
      currency: 'BRL' as const,
      priceSource: 'estimated' as const,
      lastUpdated: now,
      affiliateUrl,
      websiteUrl: s.websiteUrl,
      buyUrl,
      compatibility: compatibilityScore(piece, s.key, profile),
    };
  });
}

// ------------------------- Diagnosis extraction -------------------------

function pickStr(o: Record<string, unknown> | null | undefined, keys: string[]): string | undefined {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickArr(o: Record<string, unknown> | null | undefined, keys: string[]): string[] {
  if (!o) return [];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
    if (typeof v === 'string') return [v];
  }
  return [];
}

export function extractProfile(diag: {
  body_analysis?: Record<string, unknown> | null;
  color_analysis?: Record<string, unknown> | null;
  style_analysis?: Record<string, unknown> | null;
  questionnaire?: Record<string, unknown> | null;
}): DiagnosisProfile {
  return {
    bodyType: pickStr(diag.body_analysis, ['tipo_corporal', 'body_type', 'silhueta']),
    palette: pickStr(diag.color_analysis, ['paleta', 'estacao', 'season']),
    styles: pickArr(diag.style_analysis, ['estilos_predominantes', 'estilo_principal', 'palavras_chave']),
    budget: pickStr(diag.questionnaire, ['budget', 'orcamento']),
  };
}

const CATEGORY_KEYS = ['tops', 'bottoms', 'vestidos', 'tercas_pecas', 'calcados', 'bolsas', 'acessorios'];
// Keys used by EssentialsSection — MUST match to keep Shopping in sync with Guarda-Roupa.
const ESSENTIALS_CATEGORY_KEYS = [
  'tops_essenciais',
  'bottoms_essenciais',
  'vestidos_essenciais',
  'tercas_pecas',
  'calcados_essenciais',
  'acessorios_essenciais',
];

function pushName(set: Set<string>, item: unknown) {
  if (typeof item === 'string') {
    item.split(/\s*\+\s*/).forEach((p) => {
      const t = p.trim();
      if (t) set.add(t);
    });
  } else if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    const n = rec.peca || rec.nome || rec.name || rec.descricao;
    if (typeof n === 'string' && n.trim()) set.add(n.trim());
  }
}

export function extractPieces(
  capsule: Record<string, unknown> | null | undefined,
  essentials: Record<string, unknown> | null | undefined
): string[] {
  const set = new Set<string>();

  // 1) SINGLE SOURCE OF TRUTH — same data EssentialsSection renders.
  if (essentials) {
    for (const k of ESSENTIALS_CATEGORY_KEYS) {
      const arr = (essentials as Record<string, unknown>)[k];
      if (Array.isArray(arr)) arr.forEach((it) => pushName(set, it));
    }
    // Legacy flat keys fallback.
    if (set.size === 0) {
      for (const k of ['pecas_essenciais', 'essenciais', 'pecas']) {
        const v = (essentials as Record<string, unknown>)[k];
        if (Array.isArray(v)) v.forEach((it) => pushName(set, it));
      }
    }
    // Any remaining array on essentials (dynamic AI keys).
    if (set.size === 0) {
      for (const [k, v] of Object.entries(essentials)) {
        if (k === 'total_pecas' || k === 'investimento_sugerido') continue;
        if (Array.isArray(v)) v.forEach((it) => pushName(set, it));
      }
    }
  }

  // 2) Fallback to capsule wardrobe only if essentials produced nothing.
  if (set.size === 0 && capsule) {
    const cap = (capsule['pecas_capsula'] || capsule['pecas']) as Record<string, unknown> | undefined;
    if (cap) {
      for (const key of CATEGORY_KEYS) {
        const arr = cap[key];
        if (Array.isArray(arr)) arr.forEach((it) => pushName(set, it));
      }
    }
  }

  return [...set].slice(0, 16);
}

// ------------------------- Click tracking -------------------------

export async function trackPieceClick(params: {
  product: PieceProduct;
  diagnosisId?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('fashion_affiliate_clicks').insert({
      user_id: user?.id ?? null,
      product_id: null,
      diagnosis_id: params.diagnosisId ?? null,
    });
  } catch (err) {
    console.warn('[pieceShopping] tracking failed', err);
  }
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function getStore(key: string): StoreDef | undefined {
  return STORE_BY_KEY[key];
}
