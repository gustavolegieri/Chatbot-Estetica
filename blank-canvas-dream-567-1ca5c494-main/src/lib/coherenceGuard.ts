// EST ELITE — Coherence Guard
// Deterministic overrides that force the dossier UI to respect the
// user's literal questionnaire answers, above any AI inference.
//
// Rule of thumb: the questionnaire is the SOURCE OF TRUTH. Whenever the
// generated content contradicts a literal answer, the guard rewrites,
// filters or replaces the offending fields.

import { toText } from '@/lib/renderText';

type Dict = Record<string, unknown>;

const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
};

const norm = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ── Budget ───────────────────────────────────────────────────────────
export type BudgetTier = 'low' | 'medium' | 'high';

export function budgetTier(q: Dict | null | undefined): BudgetTier {
  const raw = norm(String(q?.orcamento ?? q?.orcamentoMensal ?? q?.budget ?? ''));
  if (!raw) return 'medium';
  if (/low|econom|baixo|ate\s*r?\$?\s*500|ate\s*500/.test(raw)) return 'low';
  if (/high|premium|luxo|alto|acima\s*de\s*3|3\.?000\+|5\.?000/.test(raw)) return 'high';
  return 'medium';
}

// Luxury vocabulary that must NEVER appear in Peças/Cápsula when budget = low.
const LUXURY_TERMS = [
  'camurça premium', 'camurca premium', 'seda pura', 'seda ', 'cashmere',
  'crepe de alfaiataria', 'gabardine', 'lã fria', 'la fria', 'lã virgem',
  'la virgem', 'linho belga', 'algodão egípcio', 'algodao egipcio',
  'couro nobre', 'couro italiano', 'tweed francês', 'tweed frances',
  'seda pesada',
];

// Approved low-budget substitutes when a luxury term must be softened.
const LOW_BUDGET_SUBSTITUTES: Record<string, string> = {
  'camurça premium': 'couro sintético de boa qualidade',
  'camurca premium': 'couro sintético de boa qualidade',
  'seda pura': 'viscose fluida',
  'seda pesada': 'viscose encorpada',
  'seda': 'viscose fluida',
  'cashmere': 'malha de algodão premium',
  'crepe de alfaiataria': 'algodão encorpado',
  'gabardine': 'algodão encorpado',
  'lã fria': 'algodão de gramatura firme',
  'la fria': 'algodão de gramatura firme',
  'lã virgem': 'malha grossa de algodão',
  'la virgem': 'malha grossa de algodão',
  'linho belga': 'linho de algodão',
  'algodão egípcio': 'algodão pima',
  'algodao egipcio': 'algodão pima',
  'couro nobre': 'couro sintético de boa qualidade',
  'couro italiano': 'couro sintético de boa qualidade',
  'tweed francês': 'malha estruturada',
  'tweed frances': 'malha estruturada',
};

export function rewriteForBudget(text: string, tier: BudgetTier): string {
  if (tier !== 'low' || !text) return text;
  let out = text;
  for (const [lux, sub] of Object.entries(LOW_BUDGET_SUBSTITUTES)) {
    const re = new RegExp(lux.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, sub);
  }
  return out;
}

// ── Aversões sensoriais (cintura apertada / marcada) ─────────────────
export function aversaoCinturaMarcada(q: Dict | null | undefined): boolean {
  const aversoes = asArray(q?.aversoesSensoriais).map(norm).join(' | ');
  return /cintura|apertad\w*\s+na\s+cintura|marc(ar|ada)\s+cintura|cinto/.test(aversoes);
}

const CINTURA_MARKING_PATTERNS = [
  /marc\w*\s+(a\s+)?cintura/i, /cinto\s+(para\s+)?marc/i,
  /cintura\s+marcad/i, /ajust\w*\s+na\s+cintura/i,
  /pin[çc]ad\w*\s+na\s+cintura/i,
];

export function filterCinturaItems(items: unknown[], q: Dict | null | undefined): unknown[] {
  if (!aversaoCinturaMarcada(q)) return items;
  return items.filter((it) => {
    const t = toText(it);
    return !CINTURA_MARKING_PATTERNS.some((r) => r.test(t));
  });
}

export function cinturaOverrideItems(q: Dict | null | undefined): string[] | null {
  if (!aversaoCinturaMarcada(q)) return null;
  return [
    'Caimento reto ou levemente solto na cintura — sem pinças ou cintos que marquem.',
    'Vestidos coluna, chemise e camisas sem marcação central.',
    'Elásticos macios e cós largos que não pressionam a região.',
  ];
}

// ── Metais preferidos ────────────────────────────────────────────────
export function metaisOverride(q: Dict | null | undefined): string | null {
  const raw = norm(String(q?.metaisPreferidos ?? ''));
  if (!raw) return null;
  if (/mist|ambos|dois|todos/.test(raw)) return 'Ouro e prata (misto — combine livremente).';
  if (/ouro\s*ros/.test(raw)) return 'Ouro rosé.';
  if (/ouro/.test(raw)) return 'Ouro amarelo.';
  if (/prata/.test(raw)) return 'Prata escovada.';
  return null;
}

// ── Estampas preferidas (nunca listar como "evitar") ─────────────────
export function estampasPreferidas(q: Dict | null | undefined): string[] {
  return asArray(q?.estampasPreferidas);
}

// ── Tecidos preferidos / evitar (respeitar termo literal) ────────────
export function tecidosPreferidos(q: Dict | null | undefined): string[] {
  return asArray(q?.tecidosPreferidos);
}
export function tecidosEvitar(q: Dict | null | undefined): string[] {
  return asArray(q?.tecidosEvitar);
}

// Merge literal user tokens into AI lists, preserving user tokens verbatim
// and removing entries whose text contradicts them.
export function mergePreferred(aiList: unknown[] | undefined, userTokens: string[]): unknown[] {
  const base = Array.isArray(aiList) ? aiList : [];
  if (userTokens.length === 0) return base;
  const lowered = userTokens.map(norm);
  const kept = base.filter((it) => {
    const t = norm(toText(it));
    // drop any AI entry whose meaning contradicts (starts with "evite/nao use/nunca")
    return !/^\s*(evite|nao|não|nunca)\b/.test(t);
  });
  const already = new Set(kept.map((k) => norm(toText(k))));
  const merged = [...kept];
  for (let i = 0; i < userTokens.length; i++) {
    if (!already.has(lowered[i])) merged.unshift(userTokens[i]);
  }
  return merged;
}

// ── Avoid section: strip contradictions with user preferences ────────
export function filterAvoidContradictions(
  items: Array<{ nome: string; motivo?: string }>,
  q: Dict | null | undefined,
): Array<{ nome: string; motivo?: string }> {
  const prefEstampas = estampasPreferidas(q).map(norm);
  const prefTecidos = tecidosPreferidos(q).map(norm);
  const evitarTecidos = tecidosEvitar(q).map(norm);
  return items.filter((it) => {
    const t = norm(`${it.nome} ${it.motivo || ''}`);
    // If user LIKES big florals, don't say "avoid big prints/florals".
    for (const p of prefEstampas) {
      if (!p) continue;
      if (t.includes(p)) return false;
      if (/floral/.test(p) && /(floral|estampa\s*grande|estampas\s*grandes)/.test(t)) return false;
      if (/poa|polka/.test(p) && /(poa|poá|polka)/.test(t)) return false;
      if (/animal/.test(p) && /(animal\s*print|onça|onca|leopard|zebra)/.test(t)) return false;
      if (/xadrez|plaid/.test(p) && /(xadrez|plaid|tartan)/.test(t)) return false;
    }
    // Don't tell user to avoid a fabric they explicitly love.
    for (const p of prefTecidos) {
      if (p && t.includes(p)) return false;
    }
    // If user explicitly asked to avoid a fabric, don't rewrite it to a
    // different one (e.g. "malha grossa" → keep "malha grossa" verbatim).
    for (const e of evitarTecidos) {
      if (!e) continue;
      // if the AI wrote a near-miss (e.g. "malha muito fina" when user said
      // "malha grossa"), swap description with the user's literal.
      if (/malha/.test(e) && /malha/.test(t) && !t.includes(e)) {
        it.nome = e.charAt(0).toUpperCase() + e.slice(1);
      }
    }
    return true;
  });
}

// Add avoid items that come strictly from the questionnaire and must be present.
export function forcedAvoidFromQuestionnaire(
  q: Dict | null | undefined,
): Array<{ nome: string; motivo: string }> {
  const out: Array<{ nome: string; motivo: string }> = [];
  const et = tecidosEvitar(q);
  for (const t of et) {
    out.push({
      nome: t.charAt(0).toUpperCase() + t.slice(1),
      motivo: 'Tecido marcado por você como desconfortável ou indesejado no questionário — mantido fora das recomendações.',
    });
  }
  const cores = String(q?.coresQueEvita ?? '').trim();
  if (cores) {
    out.push({ nome: `Cores: ${cores}`, motivo: 'Cores marcadas por você como evitadas no questionário.' });
  }
  const aver = asArray(q?.aversoesSensoriais);
  for (const a of aver) {
    out.push({ nome: a, motivo: 'Aversão sensorial declarada no questionário — respeitada em silhueta e caimento.' });
  }
  return out;
}

const PIECE_COLOR_FAMILIES: Array<{ key: string; rx: RegExp; replaceRx: RegExp }> = [
  { key: 'yellow', rx: /\b(amarel\w*|yellow|mostarda|mustard)\b/i, replaceRx: /\b(amarel\w*(?:\s+(?:vivo|brilhante|neon|lim[aã]o))?|yellow(?:\s+(?:bright|neon))?|mostarda|mustard)\b/gi },
  { key: 'orange', rx: /\b(laranj\w*|orange|terracot\w*)\b/i, replaceRx: /\b(laranj\w*(?:\s+vibrante)?|orange|terracot\w*)\b/gi },
  { key: 'coral', rx: /\bcoral\w*\b/i, replaceRx: /\bcoral\w*(?:\s+vivo)?\b/gi },
  { key: 'red', rx: /\b(vermelh\w*|red|vinho|bord[oô]|burgundy)\b/i, replaceRx: /\b(vermelh\w*|red|vinho|bord[oô]|burgundy)\b/gi },
  { key: 'pink', rx: /\b(rosa|pink|magenta|f[uú]csia|fuchsia)\b/i, replaceRx: /\b(rosa(?:\s+quente)?|pink|magenta|f[uú]csia|fuchsia)\b/gi },
  { key: 'violet', rx: /\b(roxo|violet\w*|purple|lil[aá]s|lavand\w*)\b/i, replaceRx: /\b(roxo|violet\w*|purple|lil[aá]s|lavand\w*)\b/gi },
  { key: 'turquoise', rx: /\b(turques\w*|turquoise|teal|azul[-\s]?petr[oó]leo)\b/i, replaceRx: /\b(turques\w*|turquoise|teal|azul[-\s]?petr[oó]leo)\b/gi },
  { key: 'blue', rx: /\b(azul\w*|blue|navy|marinho)\b/i, replaceRx: /\b(azul(?:[-\s](?:marinho|claro|royal|cobalto|anil))?|blue|navy|marinho)\b/gi },
  { key: 'green', rx: /\b(verde\w*|green|oliva|olive|esmeralda|emerald)\b/i, replaceRx: /\b(verde(?:[-\s](?:folha|oliva|musgo|grama|floresta|s[aá]lvia))?|green|oliva|olive|esmeralda|emerald)\b/gi },
  { key: 'brown', rx: /\b(marrom|brown|caramelo|camel|bege|beige|nude)\b/i, replaceRx: /\b(marrom|brown|caramelo|camel|bege(?:\s+champanhe)?|beige|nude)\b/gi },
  { key: 'black', rx: /\b(preto|black)\b/i, replaceRx: /\b(preto|black)\b/gi },
  { key: 'white', rx: /\b(branco|white|off[-\s]?white|marfim|ivory|creme|cream)\b/i, replaceRx: /\b(branco(?:\s+puro)?|white|off[-\s]?white(?:\s+quente)?|marfim|ivory|creme(?:\s+dourado)?|cream)\b/gi },
  { key: 'gray', rx: /\b(cinza|gray|grey|grafite)\b/i, replaceRx: /\b(cinza(?:[-\s](?:pomba|grafite|chumbo|claro|m[eé]dio))?|gray|grey|grafite)\b/gi },
];

const PIECE_MATERIAL_RX = /seda(?:\s+crepe(?:\s+(?:pesada|leve))?)?|crepe(?:\s+(?:pesado|pesada|leve|fluido|encorpado))?|cashmere(?:\s+puro)?|couro(?:\s+nappa)?(?:\s+(?:macio|italiano|envernizado|refinado|premium))?|camur[cç]a(?:\s+(?:lavada|refinada|premium))?|algod[aã]o(?:\s+(?:pima|eg[ií]pcio|pesado|lavado|macio))?|linho(?:\s+(?:fino|lavado|leve|misto))?|(?<![a-zà-ÿ])l[aã](?![a-zà-ÿ])(?:\s+fria)?(?:\s+italiana)?|tweed(?:\s+boucl[eé])?|sarja(?:\s+(?:leve|macia|stonewashed))?|modal(?:\s+macio)?|viscose(?:\s+(?:fluida|encorpada|alfaiatada))?|cetim(?:\s+duquesa)?|denim|jeans|gabardine(?:\s+(?:fina|macia|encorpada))?|tricot(?:\s+italiano)?|malha(?:\s+[a-zà-ÿ-]+){0,2}/gi;

function flattenColorNames(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === 'string') return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => flattenColorNames(item, depth + 1));
  if (typeof value === 'object') return Object.values(value as Dict).flatMap((item) => flattenColorNames(item, depth + 1));
  return [];
}

function stripConflictingMaterials(text: string): string {
  const matches = Array.from(text.matchAll(PIECE_MATERIAL_RX));
  if (matches.length <= 1) return text;
  let output = text;
  for (const match of matches.slice(1).reverse()) {
    if (match.index == null) continue;
    let start = match.index;
    const before = output.slice(0, start);
    const joiner = before.match(/\s+(?:em|de)\s+$/i);
    if (joiner?.index != null) start = joiner.index;
    output = `${output.slice(0, start)} ${output.slice(match.index + match[0].length)}`;
  }
  return output.replace(/\s+/g, ' ').trim();
}

function stablePieceIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return length ? (hash >>> 0) % length : 0;
}

export function normalizePieceRecommendation(
  name: string,
  color: string | null | undefined,
  questionnaire: Dict | null | undefined,
  colorAnalysis: Dict | null | undefined,
): { name: string; color: string } {
  const avoidedText = norm([questionnaire?.coresQueEvita, ...(asArray(questionnaire?.coresEvitar))].join(' '));
  const avoidedFamilies = new Set(PIECE_COLOR_FAMILIES.filter((family) => family.rx.test(avoidedText)).map((family) => family.key));
  const paletteCandidates = [
    ...flattenColorNames(questionnaire?.coresQueAma),
    ...flattenColorNames(colorAnalysis?.paleta_cores_ideais ?? colorAnalysis?.paleta ?? colorAnalysis?.cores_recomendadas),
  ].filter((candidate) => !PIECE_COLOR_FAMILIES.some((family) => avoidedFamilies.has(family.key) && family.rx.test(norm(candidate))));
  const fallbackCandidates = ['off-white', 'azul-marinho', 'verde-oliva', 'cinza-pomba', 'caramelo']
    .filter((candidate) => !PIECE_COLOR_FAMILIES.some((family) => avoidedFamilies.has(family.key) && family.rx.test(norm(candidate))));
  const candidates = paletteCandidates.length ? paletteCandidates : fallbackCandidates;
  const replacement = candidates[stablePieceIndex(name, candidates.length)] || 'taupe';
  let normalizedName = stripConflictingMaterials(name);
  let normalizedColor = String(color || '').trim();
  for (const family of PIECE_COLOR_FAMILIES) {
    if (!avoidedFamilies.has(family.key)) continue;
    if (family.rx.test(norm(normalizedName))) normalizedName = normalizedName.replace(family.replaceRx, replacement);
    if (family.rx.test(norm(normalizedColor))) normalizedColor = replacement;
  }
  const avoidedFabrics = tecidosEvitar(questionnaire).map(norm);
  const preferredFabric = tecidosPreferidos(questionnaire)[0] || 'algodão macio';
  for (const fabric of avoidedFabrics) {
    if (!fabric) continue;
    const escaped = fabric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalizedName = normalizedName.replace(new RegExp(escaped, 'gi'), preferredFabric);
  }
  return { name: normalizedName.replace(/\s+/g, ' ').trim(), color: normalizedColor || replacement };
}
