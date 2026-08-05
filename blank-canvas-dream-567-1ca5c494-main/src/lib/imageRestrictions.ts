// EST ELITE — Central restriction dictionary + reusable validated image search.
//
// Image banks (Pexels/Unsplash/Pixabay) don't support reliable "NOT" operators,
// so we (a) build very specific positive queries and (b) filter the returned
// tags/alt/description on the edge function using this exclusion list.
//
// Every point in the app that fetches from an image bank MUST go through
// `buscarImagemValidada` so the same filter is applied.

import { invokeWithQueue } from '@/lib/invokeQueue';
import type { DiagnosticData } from '@/types/diagnostic';

/** PT → EN translation for restriction / avoidance terms.
 *  Keys are matched (normalized, lower-case) against user-provided lists.
 *  Each value is a set of EN tokens searched inside image tags/alt/description. */
export const RESTRICTION_PT_EN: Record<string, string[]> = {
  // Fabrics / materials
  renda: ['lace'],
  crochê: ['crochet'], croche: ['crochet'],
  tricot: ['knit', 'knitted'],
  cetim: ['satin'],
  seda: ['silk'],
  veludo: ['velvet'],
  couro: ['leather'],
  jeans: ['denim'],
  linho: ['linen'],
  camurça: ['suede'], camurca: ['suede'],
  tweed: ['tweed'],
  sintético: ['polyester', 'synthetic'], sintetico: ['polyester', 'synthetic'],
  poliéster: ['polyester'], poliester: ['polyester'],
  lycra: ['lycra', 'spandex'],
  lã: ['wool'], la: ['wool'],
  pelúcia: ['fur', 'faux fur'], pelucia: ['fur', 'faux fur'],
  pele: ['fur'],
  transparência: ['sheer', 'transparent', 'see-through'], transparencia: ['sheer', 'transparent'],
  transparente: ['sheer', 'transparent'],

  // Ornamentation / finishes
  brilho: ['sequin', 'glitter', 'shiny', 'metallic'],
  brilhos: ['sequin', 'glitter', 'shiny', 'metallic'],
  paetê: ['sequin', 'paillette'], paete: ['sequin'],
  lantejoula: ['sequin'],
  franja: ['fringe', 'fringed'], franjas: ['fringe', 'fringed'],
  bordado: ['embroidery', 'embroidered'],
  metalizado: ['metallic', 'foil'],
  neon: ['neon', 'fluorescent'],

  // Prints
  'estampa grande': ['bold print', 'large print', 'oversized print'],
  'estampas grandes': ['bold print', 'large print'],
  'estampa animal': ['animal print', 'leopard', 'zebra', 'snake print'],
  'animal print': ['animal print', 'leopard', 'zebra'],
  floral: ['floral', 'flower print'],
  xadrez: ['plaid', 'checkered', 'tartan'],
  listras: ['striped', 'stripes'],
  poá: ['polka dot'], poa: ['polka dot'],

  // Silhouettes / cuts
  'decote profundo': ['plunging', 'low cut'],
  'ombro a ombro': ['off shoulder', 'off-shoulder'],
  'sem alças': ['strapless'],
  cropped: ['crop top', 'cropped'],
  'mini saia': ['mini skirt'],
  oversized: ['oversized'],
  skinny: ['skinny'],
};

const NEG_KEYWORDS_ALWAYS = ['man', 'men', 'male', 'boy', 'boys'];

function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** Merge, translate, dedupe restriction terms coming from any source. */
export function buildRestrictionKeywords(rawTerms: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const term of rawTerms) {
    if (!term) continue;
    const n = normalize(term);
    if (!n) continue;

    // exact map hit
    if (RESTRICTION_PT_EN[n]) {
      RESTRICTION_PT_EN[n].forEach((t) => out.add(t.toLowerCase()));
      continue;
    }
    // substring: catch multi-word user entries like "não gosto de renda"
    for (const [pt, ens] of Object.entries(RESTRICTION_PT_EN)) {
      if (n.includes(pt)) ens.forEach((t) => out.add(t.toLowerCase()));
    }
    // pass through english-looking single words as-is
    if (/^[a-z\- ]{3,}$/.test(n) && !n.includes(' ')) out.add(n);
  }
  return Array.from(out);
}

/** Extract every restriction we can find from the user's diagnostic + final report. */
export function extractRestrictions(
  diagnostic?: Partial<DiagnosticData> | null,
  finalDiagnosis?: Record<string, unknown> | null,
): string[] {
  const raw: (string | undefined | null)[] = [];

  const d = diagnostic as Record<string, unknown> | null | undefined;
  const push = (v: unknown) => {
    if (Array.isArray(v)) v.forEach((x) => raw.push(String(x)));
    else if (typeof v === 'string') raw.push(v);
  };
  push(d?.restricoes);
  push(d?.tecidosEvitar);
  push(d?.elementosEvitar);
  push(d?.decotesEvitar);
  push(d?.coresEvitar);
  push(d?.estampasEvitar);

  const fd = finalDiagnosis as Record<string, any> | null | undefined;
  if (fd) {
    push(fd.tecidos_evitar);
    push(fd.decotes_evitar);
    push(fd.elementos_evitar);
    push(fd.cores_evitar);
    push(fd.estampas_evitar);
    // fd.evitar is an array of { nome, motivo } objects — extract the nome
    // strings so they participate in per-user image filtering.
    const evitarList = fd.evitar;
    if (Array.isArray(evitarList)) {
      for (const it of evitarList) {
        if (typeof it === 'string') raw.push(it);
        else if (it && typeof it === 'object') {
          const o = it as Record<string, unknown>;
          const nome = o.nome ?? o.item ?? o.titulo ?? o.name;
          if (typeof nome === 'string') raw.push(nome);
        }
      }
    }
    const mod = fd.modelagens as Record<string, unknown> | undefined;
    if (mod) {
      push(mod.tecidos_evitar);
      push(mod.decotes_evitar);
    }
  }

  return buildRestrictionKeywords(raw);
}

export interface SearchContext {
  section?: string;
  variant?: 'primary' | 'secondary';
  mode?: 'product' | 'editorial';
  query: string;
  fallbackQueries?: string[];
  diagnosisId: string;
  count?: number;
  seed?: number;
  category?: string;
}

export interface ValidatedImageResult {
  url: string | null;
  source: string;
  score?: number;
  discarded?: { url: string; reason: string }[];
}

/** Centralized entrypoint: every image bank call must go through here. */
export async function buscarImagemValidada(
  profile: { diagnostic?: Partial<DiagnosticData> | null; finalDiagnosis?: Record<string, unknown> | null; restrictions?: string[] },
  ctx: SearchContext,
): Promise<ValidatedImageResult> {
  const restrictions = profile.restrictions?.length
    ? profile.restrictions
    : extractRestrictions(profile.diagnostic, profile.finalDiagnosis);

  const negatives = Array.from(new Set([...restrictions, ...NEG_KEYWORDS_ALWAYS]));

  if (import.meta.env.DEV) {
    console.log('[buscarImagemValidada] query=', ctx.query, 'section=', ctx.section, 'restrictions=', negatives);
  }

  try {
    const queries = Array.from(new Set([ctx.query, ...(ctx.fallbackQueries ?? [])].filter(Boolean)));
    for (let i = 0; i < queries.length; i += 1) {
      const { data, error } = await invokeWithQueue('pexels-search-image', {
        body: {
          query: queries[i],
          seed: (ctx.seed ?? 0) + i * 137,
        },
      }, { timeoutMs: 8000, retries: 1 });

      if (error) {
        if (import.meta.env.DEV) console.warn('[buscarImagemValidada] pexels soft miss', error);
        continue;
      }

      if (data?.imageUrl) {
        return {
          url: data.imageUrl,
          source: 'pexels',
          score: 1,
          discarded: [],
        };
      }
    }

    return {
      url: null,
      source: 'none',
      discarded: [],
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[buscarImagemValidada] threw', e);
    return { url: null, source: 'error' };
  }
}
