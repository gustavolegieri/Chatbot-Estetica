// Coherent look composition: define an aesthetic line first, then score
// candidate combinations. Only accept looks with score > 85.
// Use this when assembling looks client-side from existing wardrobe items.

export interface Piece {
  id?: string;
  name: string;
  category?: string;       // e.g. 'top' | 'bottom' | 'shoe' | 'outer' | 'bag'
  color?: string;          // descriptive: "taupe", "off-white"
  style?: string;          // "natural chic", "classic", ...
  occasion?: string[];     // ["casual", "trabalho"]
  temperature?: ('frio' | 'ameno' | 'quente')[];
}

export interface UserProfile {
  bodyType?: string;
  palette?: string;
  paletteColors?: string[];
  styles?: string[];
  silhouette?: string;
}

export interface AestheticLine {
  style: string;
  palette: string[];
  silhouette: string;
}

const PALETTE_PRESETS: Record<string, string[]> = {
  'natural chic':       ['taupe', 'sage', 'dusty rose', 'off-white', 'caramelo'],
  'classico':           ['preto', 'branco', 'navy', 'camel', 'cinza'],
  'classico moderno':   ['preto', 'branco', 'navy', 'camel', 'cinza'],
  'romantico':          ['rosa', 'lavanda', 'creme', 'pêssego'],
  'sofisticado':        ['preto', 'vinho', 'champanhe', 'nude'],
  'minimalista':        ['preto', 'branco', 'bege', 'cinza'],
  'urbano':             ['preto', 'cinza', 'denim', 'oliva'],
};

const SILHOUETTES: Record<string, string> = {
  'ampulheta':            'cintura marcada + curvas valorizadas',
  'pera':                 'volume superior + alongamento de pernas',
  'triangulo invertido':  'equilíbrio com volume inferior',
  'retangulo':            'cintura criada + sobreposições',
  'oval':                 'linhas verticais + caimento fluido',
};

function norm(v?: string): string {
  return (v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function pickAestheticLine(profile: UserProfile): AestheticLine {
  const style = (profile.styles?.[0] ?? 'classico moderno').trim();
  const key = norm(style);
  const palette = profile.paletteColors?.length
    ? profile.paletteColors
    : PALETTE_PRESETS[key] ?? PALETTE_PRESETS['classico moderno'];
  const silhouette = profile.silhouette ?? SILHOUETTES[norm(profile.bodyType)] ?? 'silhueta equilibrada';
  return { style, palette, silhouette };
}

function colorMatch(items: Piece[], palette: string[]): number {
  if (!items.length) return 0;
  const pal = palette.map(norm);
  const hits = items.filter((it) => {
    const c = norm(it.color);
    if (!c) return false;
    return pal.some((p) => c.includes(p) || p.includes(c));
  }).length;
  return (hits / items.length) * 100;
}

function bodyMatch(items: Piece[], bodyType?: string): number {
  // Heuristic: presence of a piece that creates the favored silhouette.
  const t = norm(bodyType);
  if (!t) return 70;
  const names = items.map((it) => norm(it.name) + ' ' + norm(it.category)).join(' | ');
  const favors: Record<string, RegExp> = {
    'ampulheta':           /cinto|alfaiataria|envelope|wrap|cintura/,
    'pera':                /blazer|ombr|estampa.*sup|decote v|cropped/,
    'triangulo invertido': /saia.*volume|calca.*pantalona|wide|bootcut/,
    'retangulo':           /cinto|peplum|sobreposi|colete/,
    'oval':                /reta|fluida|vertical|tunica|kaftan/,
  };
  const re = favors[t];
  if (!re) return 75;
  return re.test(names) ? 95 : 55;
}

function styleMatch(items: Piece[], line: AestheticLine): number {
  if (!items.length) return 0;
  const target = norm(line.style);
  const hits = items.filter((it) => norm(it.style).includes(target) || target.includes(norm(it.style))).length;
  return items.every((it) => !it.style) ? 75 : (hits / items.length) * 100;
}

function occasionMatch(items: Piece[], occasion?: string): number {
  if (!occasion) return 85;
  const o = norm(occasion);
  const hits = items.filter((it) => (it.occasion ?? []).some((x) => norm(x).includes(o))).length;
  return items.every((it) => !it.occasion?.length) ? 80 : (hits / items.length) * 100;
}

export interface LookScore {
  total: number;
  breakdown: { colorMatch: number; bodyMatch: number; styleMatch: number; occasionMatch: number };
}

export function scoreLook(
  items: Piece[],
  line: AestheticLine,
  profile: UserProfile,
  occasion?: string,
): LookScore {
  const cm = colorMatch(items, line.palette);
  const bm = bodyMatch(items, profile.bodyType);
  const sm = styleMatch(items, line);
  const om = occasionMatch(items, occasion);
  const total = cm * 0.3 + bm * 0.3 + sm * 0.2 + om * 0.2;
  return { total, breakdown: { colorMatch: cm, bodyMatch: bm, styleMatch: sm, occasionMatch: om } };
}

export interface AssembledLook {
  items: Piece[];
  score: LookScore;
  line: AestheticLine;
  accepted: boolean; // score > 85
}

/**
 * Assemble a coherent look from candidate pieces.
 * Tries combinations and returns the first that scores > 85.
 * Falls back to the best combination available (accepted=false).
 */
export function assembleLook(
  candidates: Piece[],
  profile: UserProfile,
  occasion?: string,
): AssembledLook {
  const line = pickAestheticLine(profile);
  const byCat: Record<string, Piece[]> = {};
  for (const p of candidates) {
    const k = norm(p.category) || 'other';
    (byCat[k] ||= []).push(p);
  }

  const order = ['top', 'bottom', 'outer', 'shoe', 'bag'];
  const slots = order.map((k) => byCat[k] ?? []).filter((arr) => arr.length);
  if (!slots.length) {
    return { items: [], score: { total: 0, breakdown: { colorMatch: 0, bodyMatch: 0, styleMatch: 0, occasionMatch: 0 } }, line, accepted: false };
  }

  let best: AssembledLook | null = null;
  const MAX_TRIES = 60;
  let tries = 0;

  const indices = new Array(slots.length).fill(0);
  while (tries < MAX_TRIES) {
    const items = slots.map((s, i) => s[indices[i]]);
    const score = scoreLook(items, line, profile, occasion);
    if (score.total > 85) return { items, score, line, accepted: true };
    if (!best || score.total > best.score.total) best = { items, score, line, accepted: false };

    // advance indices like an odometer
    let i = 0;
    while (i < indices.length) {
      indices[i]++;
      if (indices[i] < slots[i].length) break;
      indices[i] = 0;
      i++;
    }
    if (i === indices.length) break;
    tries++;
  }

  return best ?? { items: [], score: { total: 0, breakdown: { colorMatch: 0, bodyMatch: 0, styleMatch: 0, occasionMatch: 0 } }, line, accepted: false };
}
