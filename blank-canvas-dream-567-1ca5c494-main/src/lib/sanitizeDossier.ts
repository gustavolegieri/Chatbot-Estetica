// Removes any leaked internal/system text from client-facing narratives.
// Keep patterns broad but safe (case-insensitive, sentence-scoped).
const LEAK_PATTERNS: RegExp[] = [
  /\bpontua[çc][ãa]o\s+heur[ií]stica[^.]*\.\s*/gi,
  /\bstyle\s*weights?[^.]*\.\s*/gi,
  /\bstyleWeights[^.]*\.\s*/g,
  /\([^)]*styleWeights[^)]*\)/gi,
  /\([^)]*ausente[^)]*\)/gi,
  /[^.]*evitando repeti[çc][ãa]o[^.]*\.\s*/gi,
  /[^.]*repeti[çc][ãa]o de plataforma[^.]*\.\s*/gi,
  /[^.]*diagn[óo]sticos? recentes?[^.]*\.\s*/gi,
  /[^.]*pontua[çc][ãa]o interna[^.]*\.\s*/gi,
  /[^.]*proximidade t[ée]cnica[^.]*\.\s*/gi,
  /[^.]*fallback[^.]*\.\s*/gi,
  /[^.]*eixo principal foi refinado[^.]*\.\s*/gi,
  /[^.]*ranking derivado literalmente[^.]*\.\s*/gi,
  /[^.]*crit[eé]rio t[eé]cnico interno[^.]*\.\s*/gi,
  /\bTop\s*3:[^.]*\.\s*/gi,
];

export function sanitizeNarrative(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  for (const re of LEAK_PATTERNS) out = out.replace(re, '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

// Ensure a narrative that mentions "estilo predominante é X" uses `predominante`.
export function reconcileStyleMention(text: string, predominante: string): string {
  if (!text || !predominante) return sanitizeNarrative(text);
  let out = sanitizeNarrative(text);
  out = out.replace(
    /(estilo\s+predominante\s+[ée]\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]*?)(?=[.,;:!?]|$)/gi,
    (_m, p1) => `${p1}${predominante}`
  );
  return out;
}

// Fully rebuilds the "forças secundárias" and "Top 3" fragments from the
// single source of truth (predominant + weighted list), removing broken fragments
// like "0 · Minimalista 3.0 · Elegante 2.0.".
export function rebuildStyleDescription(
  text: string,
  predominante: string,
  weighted: Array<{ nome?: string; peso?: number }>
): string {
  let out = reconcileStyleMention(text, predominante);
  const norm = (s: string) => s?.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,;:!?]/g, '').trim().toLowerCase();

  // 1. Compute clean top2 from weighted list (excluding predominante).
  const sorted = [...(weighted || [])]
    .filter((w) => w?.nome)
    .sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0));
  const seenWeighted = new Set<string>();
  const top2FromWeighted = sorted
    .map((w) => String(w.nome))
    .filter((n) => {
      const k = norm(n);
      if (!k || k === norm(predominante) || seenWeighted.has(k)) return false;
      seenWeighted.add(k);
      return true;
    })
    .slice(0, 2);

  // Cleanup leaked technical fragments regardless of weighted.
  out = out.replace(/\b\d+(?:\.\d+)?\s*·[^.]*\./g, '').trim();
  out = out.replace(/\bTop\s*3\s*:[^.]*\.?/gi, '').trim();

  // 2. Rewrite "forças secundárias em X (e Y ...)" — always drop the
  // predominante from the mentioned list, even without weighted data.
  out = out.replace(
    /for[çc]as\s+secund[áa]rias\s+em\s+([^.,;:!?]+)/gi,
    (_m, listRaw: string) => {
      let names: string[];
      if (top2FromWeighted.length) {
        names = top2FromWeighted;
      } else {
        names = listRaw
          .split(/\s*(?:,|\se\s|\/)\s*/i)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((n) => norm(n) !== norm(predominante));
        // Dedupe preserving order
        const seen = new Set<string>();
        names = names.filter((n) => {
          const k = norm(n);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 2);
      }
      if (!names.length) return '';
      const joined = names.length === 2 ? `${names[0]} e ${names[1]}` : names[0];
      return `forças secundárias em ${joined}`;
    }
  );

  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

// Rewrites "Referências alinhadas a X com toques de Y" so base = predominante
// and toque = top secundário.
export function rebuildStyleReferences(
  text: string,
  predominante: string,
  weighted: Array<{ nome?: string; peso?: number }>
): string {
  const clean = sanitizeNarrative(text);
  if (!predominante) return clean;
  const norm = (s: string) => s?.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,;:!?]/g, '').trim().toLowerCase();
  const seen = new Set<string>();
  const sec = [...(weighted || [])]
    .filter((w) => w?.nome)
    .sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0))
    .map((w) => String(w.nome))
    .filter((n) => {
      const k = norm(n);
      if (!k || k === norm(predominante) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const toque = sec[0];
  return clean.replace(
    /Refer[êe]ncias\s+alinhadas\s+a\s+[A-Za-zÀ-ÿ-]+(\s+com\s+toques?\s+de\s+[A-Za-zÀ-ÿ-]+)?/gi,
    toque
      ? `Referências alinhadas a ${predominante.toLowerCase()} com toques de ${toque.toLowerCase()}`
      : `Referências alinhadas a ${predominante.toLowerCase()}`
  );
}

// Inflect a style name to feminine singular (to agree with "essência").
// ex: Moderno → moderna, Clássico → clássica, Contemporâneo → contemporânea,
//     Elegante / Natural / Casual / Minimalista → unchanged.
function toFeminineSingular(name: string): string {
  if (!name) return name;
  const s = name.toLowerCase().trim();
  if (/ão$/.test(s)) return s.replace(/ão$/, 'ã');
  if (/o$/.test(s)) return s.replace(/o$/, 'a');
  return s;
}

// Inflect a style name to masculine plural (to agree with "toques").
// ex: Moderno → modernos, Natural → naturais, Casual → casuais,
//     Elegante → elegantes, Minimalista → minimalistas, Sedutor → sedutores.
function toMasculinePlural(name: string): string {
  if (!name) return name;
  let s = name.toLowerCase().trim();
  if (/ão$/.test(s)) return s.replace(/ão$/, 'ões');
  if (/[lL]$/.test(s)) return s.replace(/l$/, 'is');
  if (/m$/.test(s)) return s.replace(/m$/, 'ns');
  if (/[rzs]$/.test(s)) return s.endsWith('s') ? s : `${s}es`;
  if (/[aeiouáéíóúâêô]$/.test(s)) return `${s}s`;
  return `${s}s`;
}

// Rewrite the two canonical "Dicas de Estilo" lines so essence = predominante
// (feminine, agreeing with "essência") and toques = top secundário (masculine plural,
// agreeing with "toques"). Also normalizes composed tips like
// "Priorize peças com a essência X" / "Adicione toques Y para profundidade".
export function rebuildStyleTip(
  tip: string,
  predominante: string,
  weighted: Array<{ nome?: string; peso?: number }>
): string {
  if (!tip) return tip;
  const norm = (s: string) => s?.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,;:!?]/g, '').trim().toLowerCase();
  const seen = new Set<string>();
  const sec = [...(weighted || [])]
    .filter((w) => w?.nome)
    .sort((a, b) => (Number(b.peso) || 0) - (Number(a.peso) || 0))
    .map((w) => String(w.nome))
    .filter((n) => {
      const k = norm(n);
      if (!k || k === norm(predominante) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const toque = sec[0];
  let out = tip;
  if (predominante) {
    const fem = toFeminineSingular(predominante);
    out = out.replace(
      /(ess[êe]ncia\s+)([A-Za-zÀ-ÿ-]+)/gi,
      (_m, p1) => `${p1}${fem}`
    );
  }
  if (toque) {
    const plural = toMasculinePlural(toque);
    out = out.replace(
      /(toques?\s+)([A-Za-zÀ-ÿ-]+)/gi,
      (_m, p1) => `${p1}${plural}`
    );
  }
  return out;
}

