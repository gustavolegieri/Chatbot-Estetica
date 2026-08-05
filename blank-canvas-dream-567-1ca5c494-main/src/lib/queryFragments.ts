// ============================================================
// Dicionário FIXO de fragmentos PT para queries de imagem.
// Todas as queries do dossiê agora vão em português — o DDG
// indexa moda feminina em PT-BR de forma mais consistente do que
// termos EN traduzidos. A cor real também vai como parâmetro
// nativo (color=) das APIs quando aplicável.
// ============================================================

import type { DiagnosticData } from '@/types/diagnostic';

export type EstiloKey =
  | 'classico' | 'romantico' | 'natural' | 'moderno' | 'dramatico' | 'criativo';

export type PaletaKey =
  | 'neutros_quentes' | 'frios_profundos' | 'rosados_poeticos' | 'vibrante';

/** Fragmento PT por estilo (Bloco de estilo predominante). */
export const ESTILO_FRAGMENT: Record<EstiloKey, string> = {
  classico:  'clássico alfaiataria',
  romantico: 'romântico feminino',
  natural:   'natural despojado',
  moderno:   'moderno minimalista',
  dramatico: 'dramático marcante',
  criativo:  'criativo artístico',
};

/** Fragmento PT por paleta (Bloco 4 psicométrico). */
export const PALETA_FRAGMENT: Record<PaletaKey, string> = {
  neutros_quentes:  'tons neutros quentes',
  frios_profundos:  'tons frios profundos',
  rosados_poeticos: 'tons rosados suaves',
  vibrante:         'cores vibrantes',
};

/** Sufixo obrigatório para a query base (estilo + paleta). */
export const SUFIXO_FIXO = 'moda feminina look';

/** Sufixo curto para queries de seção. */
export const SUFIXO_SECTION = 'feminina moda';

export type TecidoKey =
  | 'seda' | 'cetim' | 'cashmere' | 'la_alfaiataria' | 'linho' | 'algodao'
  | 'crepe' | 'malha_canelada' | 'trico_fino' | 'jeans' | 'couro' | 'veludo';

export type EstampaKey =
  | 'liso' | 'listras' | 'xadrez' | 'poa' | 'animal'
  | 'floral_pequeno' | 'floral_grande' | 'geometrica' | 'etnica' | 'abstrata';

export type RotinaKey =
  | 'home_office' | 'escritorio' | 'hibrido' | 'clientes'
  | 'eventos' | 'viagens' | 'academico' | 'criativo';

export type OcasiaoKey =
  | 'formal' | 'corporativo' | 'encontro' | 'viagem' | 'everyday';

/** Tecidos em PT. */
export const TECIDO_FRAGMENT: Record<TecidoKey, string> = {
  seda:           'seda',
  cetim:          'cetim',
  cashmere:       'cashmere',
  la_alfaiataria: 'lã alfaiataria',
  linho:          'linho',
  algodao:        'algodão',
  crepe:          'crepe',
  malha_canelada: 'malha canelada',
  trico_fino:     'tricô fino',
  jeans:          'jeans premium',
  couro:          'couro',
  veludo:         'veludo',
};

/** Estampas em PT. */
export const ESTAMPA_FRAGMENT: Record<EstampaKey, string> = {
  liso:           'liso',
  listras:        'listras',
  xadrez:         'xadrez',
  poa:            'poá',
  animal:         'animal print',
  floral_pequeno: 'floral delicado',
  floral_grande:  'floral grande',
  geometrica:     'geométrico',
  etnica:         'étnico',
  abstrata:       'abstrato',
};

export const ROTINA_FRAGMENT: Record<RotinaKey, string> = {
  home_office: 'home office',
  escritorio:  'escritório',
  hibrido:     'smart casual',
  clientes:    'reunião cliente',
  eventos:     'evento',
  viagens:     'viagem',
  academico:   'universitária',
  criativo:    'ateliê criativo',
};


export const OCASIAO_FRAGMENT: Record<OcasiaoKey, string> = {
  formal:      'traje formal',
  corporativo: 'corporativo',
  encontro:    'jantar romântico',
  viagem:      'viagem chique',
  everyday:    'dia a dia',
};

/** Âncora de peça-alfaiataria em PT. */
export const ALFAIATARIA_FRAG = 'alfaiataria blazer calça';


// ---------- Resolvers dos novos campos ----------

const TECIDO_MAP: Record<string, TecidoKey> = {
  'Seda': 'seda', 'Cetim': 'cetim', 'Cashmere': 'cashmere',
  'Alfaiataria de lã': 'la_alfaiataria', 'Linho': 'linho',
  'Algodão pima': 'algodao', 'Crepe': 'crepe',
  'Malha canelada': 'malha_canelada', 'Tricô fino': 'trico_fino',
  'Jeans premium': 'jeans', 'Couro': 'couro', 'Veludo': 'veludo',
};

const ESTAMPA_MAP: Record<string, EstampaKey> = {
  'Lisos': 'liso', 'Listras': 'listras', 'Xadrez': 'xadrez', 'Poá': 'poa',
  'Animal print': 'animal', 'Florais delicados': 'floral_pequeno',
  'Florais grandes': 'floral_grande', 'Geométricas': 'geometrica',
  'Étnicas': 'etnica', 'Abstratas': 'abstrata',
};

const ROTINA_MAP: Record<string, RotinaKey> = {
  'Home office / remoto':        'home_office',
  'Escritório presencial':       'escritorio',
  'Rotina híbrida':              'hibrido',
  'Atendimento a clientes':      'clientes',
  'Muitos eventos':              'eventos',
  'Viagens frequentes':          'viagens',
  'Rotina acadêmica':            'academico',
  'Rotina flexível / criativa':  'criativo',
};

const OCASIAO_PRIORITY: Array<{ match: RegExp; key: OcasiaoKey }> = [
  { match: /Casamento|Formatura|Gala|Premia/i,             key: 'formal' },
  { match: /corporativo|Palestra|Reuni.+lideran/i,         key: 'corporativo' },
  { match: /Encontro.+amoros|Jantar/i,                     key: 'encontro' },
  { match: /Viagens internacionais/i,                      key: 'viagem' },
];

export function resolveEstilo(d: DiagnosticData | null | undefined): EstiloKey {
  return ESTILO_MAP[d?.estiloPersonalidade || ''] || 'moderno';
}

const ESTILO_MAP: Record<string, EstiloKey> = {
  'Clássico e atemporal':   'classico',
  'Elegante e sofisticado': 'classico',
  'Romântico e delicado':   'romantico',
  'Boho e despojado':       'natural',
  'Moderno e minimalista':  'moderno',
  'Ousado e marcante':      'dramatico',
  'Criativo e artístico':   'criativo',
};

const PALETA_MAP: Record<string, PaletaKey> = {
  paleta_neutra:   'neutros_quentes',
  paleta_fria:     'frios_profundos',
  paleta_rose:     'rosados_poeticos',
  paleta_vibrante: 'vibrante',
};

export function resolvePaleta(
  d: DiagnosticData | null | undefined,
  q: Record<string, unknown> | null | undefined,
): PaletaKey {
  const raw = String((q as any)?.psicometrico?.paleta || '');
  if (PALETA_MAP[raw]) return PALETA_MAP[raw];
  const tom = d?.tomDePele || '';
  const estilo = d?.estiloPersonalidade || '';
  const frio = /Cl[aá]ssico|Elegante|Moderno/i.test(estilo);
  if (frio && /Escuro|M[eé]dio/i.test(tom)) return 'frios_profundos';
  if (frio) return 'rosados_poeticos';
  if (/Escuro/i.test(tom)) return 'vibrante';
  return 'neutros_quentes';
}

/** Pega o 1º tecido marcado no Bloco 9. Sem match → 'seda' como âncora neutra. */
export function resolveTecido(q: Record<string, unknown> | null | undefined): TecidoKey | null {
  const arr = (q as any)?.tecidosPreferidos as string[] | undefined;
  if (Array.isArray(arr)) {
    for (const raw of arr) {
      const key = TECIDO_MAP[String(raw || '').trim()];
      if (key) return key;
    }
  }
  return null;
}

/** Pega a 1ª estampa marcada no Bloco 9. Sem match → 'liso' (solid). */
export function resolveEstampa(q: Record<string, unknown> | null | undefined): EstampaKey {
  const arr = (q as any)?.estampasPreferidas as string[] | undefined;
  if (Array.isArray(arr)) {
    for (const raw of arr) {
      const key = ESTAMPA_MAP[String(raw || '').trim()];
      if (key) return key;
    }
  }
  return 'liso';
}

/** Rotina predominante do Bloco 2. Sem match → 'hibrido' (smart casual). */
export function resolveRotina(q: Record<string, unknown> | null | undefined): RotinaKey {
  const raw = String((q as any)?.rotina || '').trim();
  return ROTINA_MAP[raw] || 'hibrido';
}

/** Ocasião prioritária do Bloco 10. Array vazio → 'everyday'. */
export function resolveOcasiao(q: Record<string, unknown> | null | undefined): OcasiaoKey {
  const arr = (q as any)?.ocasioesEspeciaisAno as string[] | undefined;
  if (!Array.isArray(arr) || arr.length === 0) return 'everyday';
  for (const rule of OCASIAO_PRIORITY) {
    if (arr.some((o) => rule.match.test(String(o || '')))) return rule.key;
  }
  return 'everyday';
}

// ---------- Builders de query (2 dicionários + sufixo fixo) ----------

/** Todas as 24 combinações possíveis estilo×paleta (mantido para testes legados). */
export function allCombinations(): Array<{ estilo: EstiloKey; paleta: PaletaKey; query: string }> {
  const out: Array<{ estilo: EstiloKey; paleta: PaletaKey; query: string }> = [];
  for (const estilo of Object.keys(ESTILO_FRAGMENT) as EstiloKey[]) {
    for (const paleta of Object.keys(PALETA_FRAGMENT) as PaletaKey[]) {
      out.push({ estilo, paleta, query: buildQuery(estilo, paleta) });
    }
  }
  return out;
}

/** Query base (estilo+paleta) — usada pela seção 'estilo' e como fallback global. */
export function buildQuery(estilo: EstiloKey, paleta: PaletaKey): string {
  return `${ESTILO_FRAGMENT[estilo]} ${PALETA_FRAGMENT[paleta]} ${SUFIXO_FIXO}`;
}

/** Sanitiza um fragmento cru: trim + no máx. 3 palavras. */
function cleanFrag(s: string, maxWords = 3): string {
  return s.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}

/** Junta 2 fragmentos + sufixo fixo (`fashion woman outfit`). Query base. */
export function buildQueryFrom(frag1: string, frag2: string): string {
  return `${cleanFrag(frag1, 2)} ${cleanFrag(frag2, 2)} ${SUFIXO_FIXO}`;
}

/**
 * Junta N fragmentos (2–3) + sufixo curto (`elegant woman style`).
 * Budget ampliado para 20 palavras (usuário pediu queries mais longas
 * para o DDG/Pexels/Unsplash filtrarem melhor o assunto).
 */
export function buildQueryFromMany(frags: string[]): string {
  const cleaned = frags.map((f) => cleanFrag(f, 3)).filter(Boolean);
  const words: string[] = [];
  const budget = 20 - 3; // reserva 3 palavras para o sufixo
  for (const f of cleaned) {
    const fw = f.split(/\s+/);
    for (const w of fw) {
      if (words.length >= budget) break;
      words.push(w);
    }
    if (words.length >= budget) break;
  }
  return `${words.join(' ')} ${SUFIXO_SECTION}`;
}

export type SectionQueryId =
  | 'estilo' | 'movimento' | 'cores' | 'paleta'
  | 'modelagens' | 'essenciais' | 'capsula' | 'alfaiataria'
  | 'tecidos_materiais' | 'coloracao_avancada' | 'moodboard' | 'inspiracoes'
  | 'acessorios' | 'beleza' | 'ocasioes' | 'viagens'
  | 'sazonalidade' | 'investimento';

export interface ProfileFragments {
  estilo: EstiloKey;
  paleta: PaletaKey;
  tecido: TecidoKey | null;
  estampa: EstampaKey;
  rotina: RotinaKey;
  ocasiao: OcasiaoKey;
}

/**
 * Assinatura CONGELADA do diagnóstico: exatamente 1 cor + 1 tecido + 1 estilo
 * derivados do questionário. Toda query de imagem do dossiê usa esta trinca —
 * nunca varia entre seções. Garante coerência visual em todo o dossiê.
 */
export interface DiagnosisSignature extends ProfileFragments {
  tecidoResolved: TecidoKey;
  styleFrag: string;
  colorFrag: string;
  fabricFrag: string;
}

/** Tecido âncora por estilo — usado quando o questionário não trouxe tecido. */
const ESTILO_DEFAULT_TECIDO: Record<EstiloKey, TecidoKey> = {
  classico:  'la_alfaiataria',
  romantico: 'seda',
  natural:   'linho',
  moderno:   'crepe',
  dramatico: 'couro',
  criativo:  'veludo',
};

/** Cor dominante em PT (1 token) por paleta — âncora fixa da assinatura. */
const PALETA_PRIMARY_COLOR: Record<PaletaKey, string> = {
  neutros_quentes:  'camel',
  frios_profundos:  'marinho',
  rosados_poeticos: 'rosa',
  vibrante:         'vermelho',
};

export function resolveProfileFragments(
  d: DiagnosticData | null | undefined,
  q: Record<string, unknown> | null | undefined,
): ProfileFragments {
  return {
    estilo: resolveEstilo(d),
    paleta: resolvePaleta(d, q),
    tecido: resolveTecido(q),
    estampa: resolveEstampa(q),
    rotina: resolveRotina(q),
    ocasiao: resolveOcasiao(q),
  };
}

/** Assinatura CONGELADA: 1 cor + 1 tecido + 1 estilo por diagnóstico. */
export function resolveDiagnosisSignature(
  d: DiagnosticData | null | undefined,
  q: Record<string, unknown> | null | undefined,
): DiagnosisSignature {
  const base = resolveProfileFragments(d, q);
  const tecidoResolved: TecidoKey = base.tecido ?? ESTILO_DEFAULT_TECIDO[base.estilo];
  return {
    ...base,
    tecidoResolved,
    styleFrag:  cleanFragExternal(ESTILO_FRAGMENT[base.estilo], 2),
    colorFrag:  PALETA_PRIMARY_COLOR[base.paleta],
    fabricFrag: cleanFragExternal(TECIDO_FRAGMENT[tecidoResolved], 2),
  };
}

function cleanFragExternal(s: string, maxWords = 3): string {
  return s.trim().split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
}

/** Limite de palavras por seção. Elevado a 20 conforme pedido do usuário —
 *  queries mais longas ajudam o DDG a filtrar por assunto (womenswear real). */
const MAX_QUERY_WORDS = 20;

/** Prefixo/âncora feminina em PT — plugado no validador quando faltar. */
const FEMALE_ANCHOR_PT = 'feminina';

/**
 * Query MOCKADA por seção — templates em PT. Cada seção compõe
 * fragmentos do questionário (estilo/paleta/tecido/estampa/rotina/ocasião)
 * com uma âncora curta em PT ("feminina moda", "editorial"). Nunca
 * concatena texto livre. Limite de ~20 palavras.
 */
export function buildSectionQuery(section: SectionQueryId, p: ProfileFragments): string {
  // Assinatura CONGELADA: 1 cor + 1 tecido + 1 estilo. Toda seção começa com
  // essa trinca — só o "assunto" da seção muda no final.
  const sig = 'tecidoResolved' in (p as any)
    ? (p as DiagnosisSignature)
    : (() => {
        const tecidoResolved = (p.tecido ?? ESTILO_DEFAULT_TECIDO[p.estilo]) as TecidoKey;
        return {
          ...p,
          tecidoResolved,
          styleFrag:  cleanFragExternal(ESTILO_FRAGMENT[p.estilo], 2),
          colorFrag:  PALETA_PRIMARY_COLOR[p.paleta],
          fabricFrag: cleanFragExternal(TECIDO_FRAGMENT[tecidoResolved], 2),
        } as DiagnosisSignature;
      })();

  const style  = sig.styleFrag;   // ex: "clássico alfaiataria"
  const color  = sig.colorFrag;   // ex: "marinho"
  const fabric = sig.fabricFrag;  // ex: "seda"
  const trio = `${style} ${color} ${fabric}`;
  const ocs  = cleanFragExternal(OCASIAO_FRAGMENT[sig.ocasiao] || '', 2);

  let q = '';
  switch (section) {
    case 'estilo':
      q = `look ${trio} woman fashion product shot isolated white background`;
      break;
    case 'movimento':
      q = `woman walking ${trio} fashion product shot isolated white background`;
      break;
    case 'moodboard':
      q = `moodboard ${trio} woman fashion editorial product shot isolated white background`;
      break;
    case 'inspiracoes':
      q = `inspiration ${trio} woman fashion editorial product shot isolated white background`;
      break;
    case 'capsula':
      q = `capsule wardrobe ${trio} woman fashion flat lay product shot isolated white background`;
      break;
    case 'coloracao_avancada':
      q = `color analysis ${color} woman portrait fashion product shot isolated white background`;
      break;
    case 'modelagens':
      q = `silhouette ${trio} woman fashion product shot isolated white background`;
      break;
    case 'essenciais':
      q = `staple wardrobe ${trio} woman fashion product shot isolated white background`;
      break;
    case 'cores':
      q = `palette ${color} fabric swatch woman fashion product shot isolated white background`;
      break;
    case 'paleta':
      q = `palette ${color} ${style} woman fashion product shot isolated white background`;
      break;
    case 'alfaiataria':
      q = `tailoring ${trio} woman fashion product shot isolated white background`;
      break;
    case 'tecidos_materiais':
      q = `fabric texture ${fabric} ${color} woman fashion product shot isolated white background`;
      break;
    case 'acessorios':
      q = `accessory ${color} ${style} woman fashion product shot isolated white background`;
      break;
    case 'beleza':
      q = `beauty portrait ${color} woman fashion product shot isolated white background`;
      break;
    case 'ocasioes':
      q = `occasion outfit ${trio} woman fashion product shot isolated white background`;
      break;
    case 'viagens':
      q = `travel outfit ${trio} woman fashion product shot isolated white background`;
      break;
    case 'sazonalidade':
      q = `seasonal outfit ${trio} woman fashion product shot isolated white background`;
      break;
    case 'investimento':
      q = `timeless investment piece ${trio} woman fashion product shot isolated white background`;
      break;
  }
  return assertQueryShape(q, section);
}

/** Valida forma da query: colapsa espaços, garante ≤MAX_QUERY_WORDS palavras
 *  e injeta âncora feminina em PT quando ausente. Nunca lança. */
export function assertQueryShape(raw: string, section: SectionQueryId): string {
  let q = (raw || '').replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  q = q.split(' ').filter(Boolean).filter((w) => {
    const k = w.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).join(' ');
  const words = q.split(' ').filter(Boolean);
  if (words.length > MAX_QUERY_WORDS) q = words.slice(0, MAX_QUERY_WORDS).join(' ');
  const hasWomanAnchor = /\b(feminina|feminino|mulher|womens?|woman|female)\b/i.test(q);
  const isColorOnly = section === 'paleta' || section === 'cores' || section === 'tecidos_materiais';
  if (!hasWomanAnchor && !isColorOnly) {
    q = `${q} ${FEMALE_ANCHOR_PT}`.trim();
    if (typeof console !== 'undefined') {
      console.warn('[queryFragments] injetada âncora "feminina" em', section, '→', q);
    }
  }
  if (!q) {
    console.warn('[queryFragments] query vazia em', section, '- fallback genérico');
    q = 'moda feminina editorial lookbook';
  }
  return q;
}




/**
 * Termos que NUNCA devem aparecer nos alts do resultado — filtrados
 * pelas edge functions (Pexels/Unsplash/Pixabay via `exclude_terms`).
 * Impede retratos masculinos/infantis/casais/esporte na plataforma feminina.
 */
const BASE_EXCLUSIONS: readonly string[] = [
  // EN
  'man', 'male', 'boy', 'boys', 'guy', 'gentleman',
  'child', 'children', 'kid', 'kids', 'baby', 'toddler',
  'fashion model', 'model', 'runway', 'catwalk', 'backstage',
  'showroom', 'editorial campaign', 'campaign', 'promo', 'advertisement',
  'couple', 'wedding', 'groom', 'bride',
  'sport', 'athlete', 'gym', 'fitness',
  'food', 'fruit', 'animal', 'dog', 'cat',
  // PT
  'homem', 'masculino', 'menino', 'criança', 'bebê', 'casal',
  'noivo', 'noiva', 'casamento', 'esporte', 'academia', 'cachorro', 'gato',
  // Marca d'água / stock com watermark visível
  'watermark', 'watermarked', 'shutterstock', 'getty', 'istock',
  'dreamstime', 'alamy', '123rf', 'depositphotos', 'adobe stock',
  'bigstock', 'fotolia', 'vectorstock', 'stocksy',
];


/** Exclusões extras por seção — reforço quando a intenção visual é específica.
 *  NOTA: 'woman' foi removido das seções cujas queries agora incluem "woman",
 *  para não descartar resultados que casam com a própria query. */
const SECTION_EXTRA_EXCLUSIONS: Partial<Record<SectionQueryId, string[]>> = {
  cores:       ['man', 'model', 'portrait', 'face'],
  paleta:      ['man', 'model', 'portrait', 'face'],
  alfaiataria: ['man', 'model', 'portrait', 'face'],
  tecidos_materiais: ['portrait', 'face'],
  modelagens:  ['portrait', 'face', 'street style'],
  essenciais:  ['portrait', 'face', 'full body'],
};

export function exclusionsForSection(section: SectionQueryId): string[] {
  const extra = SECTION_EXTRA_EXCLUSIONS[section] ?? [];
  return [...BASE_EXCLUSIONS, ...extra];
}

// ---------- Validação textual (require/forbid) enviada ao DDG ----------
//
// O DDG server-side aceita `require: string[][]` (AND entre conjuntos, OR
// dentro) e `forbid: string[]` (descarta se aparecer). As funções abaixo
// derivam esses conjuntos direto do perfil, garantindo que a imagem que
// vem tenha, no mínimo: (a) uma palavra da peça/tema da seção,
// (b) uma cor da paleta escolhida, e (c) uma palavra do estilo declarado.

/** Sinônimos de cor por paleta — usados como conjunto OR obrigatório. */
const PALETA_COLOR_TOKENS: Record<PaletaKey, string[]> = {
  frios_profundos:  ['azul', 'blue', 'marinho', 'navy', 'petroleo', 'petróleo', 'indigo', 'roxo', 'purple', 'grafite', 'charcoal', 'preto', 'black', 'frio', 'cool'],
  neutros_quentes:  ['bege', 'beige', 'camel', 'caramelo', 'marrom', 'brown', 'terracota', 'terracotta', 'mostarda', 'mustard', 'oliva', 'olive', 'quente', 'warm', 'nude', 'creme', 'cream'],
  rosados_poeticos: ['rosa', 'pink', 'blush', 'lilas', 'lilás', 'lavanda', 'lavender', 'malva', 'mauve', 'rose', 'poudre'],
  vibrante:         ['vermelho', 'red', 'coral', 'fuchsia', 'fuscia', 'magenta', 'laranja', 'orange', 'amarelo', 'yellow', 'vibrante', 'vibrant', 'colorido'],
};

/** Sinônimos de estilo — usados como conjunto OR obrigatório. */
const ESTILO_TOKENS: Record<EstiloKey, string[]> = {
  classico:  ['classico', 'clássico', 'classic', 'alfaiataria', 'tailoring', 'timeless', 'atemporal'],
  romantico: ['romantico', 'romântico', 'romantic', 'feminino', 'delicado', 'suave', 'soft'],
  natural:   ['natural', 'despojado', 'casual', 'relaxed', 'effortless', 'boho'],
  moderno:   ['moderno', 'modern', 'minimalista', 'minimalist', 'clean', 'contemporaneo', 'contemporâneo'],
  dramatico: ['dramatico', 'dramático', 'dramatic', 'bold', 'statement', 'marcante', 'poderoso', 'power'],
  criativo:  ['criativo', 'creative', 'artistico', 'artístico', 'eclectic', 'eclético', 'colorful', 'ousado'],
};

/** Sinônimos de tecido — usados como conjunto OR obrigatório (assinatura). */
const TECIDO_TOKENS: Record<TecidoKey, string[]> = {
  seda:           ['seda', 'silk', 'cetim', 'satin'],
  cetim:          ['cetim', 'satin', 'seda', 'silk'],
  cashmere:       ['cashmere', 'caxemira', 'lã', 'la', 'wool'],
  la_alfaiataria: ['lã', 'la', 'wool', 'alfaiataria', 'tailoring', 'terno', 'suit'],
  linho:          ['linho', 'linen'],
  algodao:        ['algodão', 'algodao', 'cotton', 'pima'],
  crepe:          ['crepe', 'crêpe'],
  malha_canelada: ['malha', 'canelada', 'rib', 'ribbed', 'knit'],
  trico_fino:     ['tricô', 'trico', 'tricot', 'knit', 'knitwear', 'sweater'],
  jeans:          ['jeans', 'denim'],
  couro:          ['couro', 'leather'],
  veludo:         ['veludo', 'velvet'],
};

/** Palavras-chave de peça por seção (o candidato deve mencionar pelo menos uma). */
const SECTION_PIECE_TOKENS: Partial<Record<SectionQueryId, string[]>> = {
  estilo:             ['look', 'outfit', 'street', 'style', 'fashion', 'moda', 'roupa'],
  movimento:          ['walking', 'caminhando', 'street', 'motion', 'movement', 'movimento', 'passarela', 'runway'],
  moodboard:          ['moodboard', 'mood', 'board', 'collage', 'inspiration', 'inspiração', 'editorial'],
  inspiracoes:        ['inspiration', 'inspiração', 'lookbook', 'editorial', 'reference', 'referencia', 'referência'],
  capsula:            ['capsula', 'cápsula', 'capsule', 'wardrobe', 'guarda', 'roupa', 'flat', 'lay'],
  coloracao_avancada: ['coloração', 'coloracao', 'color', 'analysis', 'analise', 'análise', 'cromatica', 'cromática', 'retrato', 'portrait'],
  modelagens:         ['silhueta', 'silhouette', 'modelagem', 'fit', 'proporção', 'proporcao'],
  essenciais:         ['basico', 'básico', 'basic', 'essential', 'essencial', 'guarda', 'wardrobe', 'staple'],
  cores:              ['paleta', 'palette', 'swatch', 'cor', 'color', 'tecido', 'fabric'],
  paleta:             ['paleta', 'palette', 'swatch', 'mood', 'color'],
  alfaiataria:        ['alfaiataria', 'tailoring', 'blazer', 'terno', 'suit', 'calça', 'trouser', 'pant'],
  tecidos_materiais:  ['tecido', 'fabric', 'textile', 'textura', 'texture', 'seda', 'silk', 'linho', 'linen', 'lã', 'wool', 'cashmere', 'algodão', 'cotton'],
  acessorios:         ['acessorio', 'acessório', 'accessory', 'bolsa', 'bag', 'sapato', 'shoe', 'joia', 'jewelry'],
  beleza:             ['beleza', 'beauty', 'maquiagem', 'makeup', 'retrato', 'portrait'],
  ocasioes:           ['look', 'outfit', 'evento', 'event', 'formal', 'ocasião', 'ocasiao'],
  viagens:            ['viagem', 'travel', 'trip', 'aeroporto', 'airport', 'street', 'look', 'outfit'],
  sazonalidade:       ['estação', 'estacao', 'season', 'inverno', 'winter', 'verão', 'verao', 'summer', 'outono', 'autumn', 'primavera', 'spring', 'look'],
  investimento:       ['blazer', 'trench', 'coat', 'casaco', 'bolsa', 'bag', 'peça', 'peca', 'investment', 'atemporal', 'timeless'],
};

/** Conjunto que garante "moda feminina" — aplicado a quase todas as seções. */
const FEM_TOKENS = ['feminina', 'feminino', 'mulher', 'woman', 'women', 'female', 'lady', 'girl'];

const NO_FEM_ANCHOR: SectionQueryId[] = ['cores', 'paleta', 'tecidos_materiais'];

/** Seções em que exigir o tecido específico da assinatura é contraproducente
 *  (retratos, análise cromática, swatches de paleta pura). */
const NO_FABRIC_REQUIRE: SectionQueryId[] = ['coloracao_avancada', 'beleza', 'paleta', 'cores'];

/** Monta os conjuntos AND/OR obrigatórios para o DDG validar.
 *  Aceita ProfileFragments ou DiagnosisSignature. */
export function requireForSection(section: SectionQueryId, p: ProfileFragments): string[][] {
  const sig: DiagnosisSignature = 'tecidoResolved' in (p as any)
    ? (p as DiagnosisSignature)
    : {
        ...p,
        tecidoResolved: (p.tecido ?? ESTILO_DEFAULT_TECIDO[p.estilo]) as TecidoKey,
        styleFrag:  cleanFragExternal(ESTILO_FRAGMENT[p.estilo], 2),
        colorFrag:  PALETA_PRIMARY_COLOR[p.paleta],
        fabricFrag: cleanFragExternal(TECIDO_FRAGMENT[(p.tecido ?? ESTILO_DEFAULT_TECIDO[p.estilo])], 2),
      };
  const sets: string[][] = [];
  const piece = SECTION_PIECE_TOKENS[section];
  if (piece && piece.length) sets.push(piece);
  // Cor: se o dossiê já trouxe a cor real da paleta da pessoa, ela entra
  // junto com os sinônimos da paleta psicométrica (conjunto OR).
  const dossierColorTokens = ((p as any).colorTokens as string[] | undefined) ?? [];
  const paletteTokens = Array.from(new Set([
    ...dossierColorTokens,
    ...(PALETA_COLOR_TOKENS[sig.paleta] || []),
  ]));
  if (paletteTokens.length) sets.push(paletteTokens);

  const estiloTokens = ESTILO_TOKENS[sig.estilo];
  if (estiloTokens && estiloTokens.length) sets.push(estiloTokens);
  if (!NO_FABRIC_REQUIRE.includes(section)) {
    const fabricTokens = TECIDO_TOKENS[sig.tecidoResolved];
    if (fabricTokens && fabricTokens.length) sets.push(fabricTokens);
  }
  if (!NO_FEM_ANCHOR.includes(section)) sets.push(FEM_TOKENS);
  if (section !== 'cores' && section !== 'paleta' && section !== 'tecidos_materiais') {
    sets.push(['real', 'fashion', 'outfit', 'look', 'style']);
  }
  return sets;
}

/** Tokens proibidos — plataforma feminina, sem masculino/infantil/off-topic. */
export function forbidForSection(_section: SectionQueryId): string[] {
  return [
    'homem', 'masculino', 'menswear', 'menino', 'garoto',
    'criança', 'crianca', 'bebê', 'bebe', 'infantil',
    'casal', 'noivo', 'wedding', 'groom',
  ];
}



/** Regra global: a paleta do questionário (Bloco 4) é a ÚNICA fonte de cor
 *  nativa para todas as imagens do diagnóstico. Isso garante coerência
 *  cromática entre estilo, moodboard, cápsula, essenciais, alfaiataria etc.
 *  A coloração pessoal (Bloco 11) ainda é exibida na seção de cores/paleta,
 *  mas NÃO tenta puxar imagens em temperaturas diferentes entre seções. */
export function shouldPaletteOverrideColor(_section: SectionQueryId): boolean {
  return true;
}

/** Cor nativa derivada da paleta preferida (Bloco 4). Usada nas seções
 *  em que o convite editorial é seguir a paleta, não a coloração pessoal. */
export function nativeColorFromPaleta(paleta: PaletaKey): NativeColor {
  switch (paleta) {
    case 'rosados_poeticos': return 'pink';
    case 'vibrante':         return 'red';
    case 'frios_profundos':  return 'blue';
    case 'neutros_quentes':  return 'orange';
  }
}


// ---------- Cor NATIVA a partir da COLORAÇÃO REAL do diagnóstico ----------
//
// A coloração pessoal (Primavera/Verão/Outono/Inverno + subtipo) é INDEPENDENTE
// do estilo de roupa. Ela é calculada pela IA a partir da foto do rosto +
// respostas do Bloco 11 (subtom, sobrancelha, veias, olhos) e fica salva em
// `final_diagnosis.chapters.coloracao` (ou blob de cor equivalente). Aqui a
// leitura é EXCLUSIVAMENTE desses campos — nunca inferimos temperatura a
// partir do estilo.
//
// Regra de temperatura:
//   Primavera + Outono → QUENTE  → orange/yellow/brown
//   Verão    + Inverno → FRIA    → blue

export type NativeColor =
  | 'orange' | 'yellow' | 'red' | 'brown'
  | 'blue' | 'violet' | 'pink'
  | 'black' | 'white' | 'gray' | 'green';

export interface ColorChapterLike {
  estacao?: unknown;             // "Primavera", "Verão", "Outono", "Inverno"
  subtipo?: unknown;             // "Quente", "Frio", "Clara", "Profundo", "Suave", "Brilhante"
  subtom_pele?: unknown;         // "Quente" | "Frio" | "Neutro"
  coloracao_pessoal?: unknown;   // texto composto ex: "Primavera Quente"
  paleta_nome?: unknown;
  estacao_cor?: unknown;
}

function pickStr(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
}

/**
 * Resolve a cor nativa a partir da estação/subtipo salvos no diagnóstico.
 * `colorChapter` vem de `final_diagnosis.chapters.coloracao` (ou similar).
 * `d?.tomDePele` só é usado como último fallback quando NENHUM campo de
 * coloração está preenchido.
 */
export function resolveNativeColor(
  d: DiagnosticData | null | undefined,
  colorChapter?: ColorChapterLike | null,
): NativeColor {
  const composed = pickStr(
    colorChapter?.coloracao_pessoal,
    colorChapter?.paleta_nome,
    colorChapter?.estacao_cor,
  );
  const estacao = pickStr(colorChapter?.estacao, composed);
  const subtipo = pickStr(colorChapter?.subtipo, composed);
  const subtom = pickStr(colorChapter?.subtom_pele);

  const isWarmSeason = /Primavera|Outono/i.test(estacao);
  const isCoolSeason = /Ver[aã]o|Inverno/i.test(estacao);

  // 1) Estação resolve temperatura direto.
  if (isCoolSeason) {
    if (/Clar[oa]|Suave/i.test(subtipo)) return 'blue';
    if (/Profundo|Escuro/i.test(subtipo)) return 'blue';
    return 'blue';
  }
  if (isWarmSeason) {
    if (/Clar[oa]/i.test(subtipo)) return 'yellow';         // Primavera Clara
    if (/Brilhante|Quente/i.test(subtipo)) return 'orange'; // Primavera/Outono Quente
    if (/Profundo|Escuro/i.test(subtipo)) return 'brown';   // Outono Profundo
    return 'orange';
  }

  // 2) Sem estação — usa subtom_pele (Quente/Frio/Neutro).
  if (/Frio/i.test(subtom)) return 'blue';
  if (/Quente/i.test(subtom)) return 'orange';

  // 3) Último recurso — tomDePele bruto, temperatura NEUTRA (ancora clara).
  const tom = d?.tomDePele || '';
  if (/Escuro/i.test(tom)) return 'brown';
  if (/M[eé]dio/i.test(tom)) return 'orange';
  return 'orange';
}

// ---------- Pool mínimo de fallback (não é fonte primária) ----------
//
// ~10 fotos GENÉRICAS de moda feminina real (Unsplash direto, URLs estáveis).
// Só é usado quando as 3 APIs falham simultaneamente (timeout/erro/vazio).
// Não tenta bater estilo/paleta — é rede de segurança para nunca renderizar
// nada quebrado.
export const GENERIC_FALLBACK_POOL: readonly string[] = Object.freeze([
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1571908598047-3f22c4a2e5f8?w=800&q=80&auto=format',
  'https://images.unsplash.com/photo-1485518882345-15568b007407?w=800&q=80&auto=format',
]);

export function pickGenericFallback(seed: number): string {
  const idx = ((seed % GENERIC_FALLBACK_POOL.length) + GENERIC_FALLBACK_POOL.length)
    % GENERIC_FALLBACK_POOL.length;
  return GENERIC_FALLBACK_POOL[idx];
}

// ============================================================
// ÂNCORAS REAIS DO DOSSIÊ (cor da paleta + tecido recomendado)
// ------------------------------------------------------------
// A assinatura genérica (PALETA_PRIMARY_COLOR / tecido default por estilo)
// é apenas um fallback. Quando o diagnóstico já foi gerado, a cor e o tecido
// que aparecem escritos no dossiê (color_analysis / modeling_analysis) são a
// FONTE DE VERDADE das queries de imagem. Assim as fotos batem com o texto:
// "navy profundo / esmeralda / magenta" + "linho, seda, cashmere, lã fria".
// ============================================================

interface ColorRule {
  re: RegExp;
  pt: string;              // token PT usado na query
  native: NativeColor;     // parâmetro color= nativo das APIs
  tokens: string[];        // sinônimos para validação textual (require)
}

const COLOR_RULES: ColorRule[] = [
  { re: /off[\s-]?white|branco/i,            pt: 'branco',           native: 'white',  tokens: ['branco', 'white', 'off-white', 'ivory', 'marfim'] },
  { re: /preto|black|ônix|onix/i,            pt: 'preto',            native: 'black',  tokens: ['preto', 'black', 'onix', 'ônix'] },
  { re: /navy|marinho/i,                     pt: 'azul marinho',     native: 'blue',   tokens: ['marinho', 'navy', 'azul', 'blue'] },
  { re: /esmeralda|emerald/i,                pt: 'verde esmeralda',  native: 'green',  tokens: ['esmeralda', 'emerald', 'verde', 'green'] },
  { re: /magenta|fúcsia|fucsia|fuchsia/i,    pt: 'magenta',          native: 'pink',   tokens: ['magenta', 'fucsia', 'fúcsia', 'fuchsia', 'pink', 'rosa'] },
  { re: /vinho|bord[oô]|burgundy|marsala/i,  pt: 'vinho',            native: 'red',    tokens: ['vinho', 'bordo', 'bordô', 'burgundy', 'wine', 'marsala'] },
  { re: /vermelho|red|rubi/i,                pt: 'vermelho',         native: 'red',    tokens: ['vermelho', 'red', 'rubi'] },
  { re: /coral|salm[aã]o/i,                  pt: 'coral',            native: 'orange', tokens: ['coral', 'salmão', 'salmao'] },
  { re: /terracota|terracotta|tijolo/i,      pt: 'terracota',        native: 'brown',  tokens: ['terracota', 'terracotta', 'tijolo'] },
  { re: /camel|caramelo|cognac|conhaque/i,   pt: 'camel',            native: 'brown',  tokens: ['camel', 'caramelo', 'cognac', 'marrom', 'brown'] },
  { re: /marrom|chocolate|caf[eé]|brown/i,   pt: 'marrom',           native: 'brown',  tokens: ['marrom', 'brown', 'chocolate', 'café'] },
  { re: /bege|beige|areia|nude|creme|cream/i,pt: 'bege',             native: 'brown',  tokens: ['bege', 'beige', 'nude', 'creme', 'cream', 'areia'] },
  { re: /mostarda|mustard|ocre/i,            pt: 'mostarda',         native: 'yellow', tokens: ['mostarda', 'mustard', 'ocre', 'amarelo'] },
  { re: /amarelo|yellow/i,                   pt: 'amarelo',          native: 'yellow', tokens: ['amarelo', 'yellow'] },
  { re: /laranja|orange|abóbora|abobora/i,   pt: 'laranja',          native: 'orange', tokens: ['laranja', 'orange'] },
  { re: /oliva|olive|militar|musgo/i,        pt: 'verde oliva',      native: 'green',  tokens: ['oliva', 'olive', 'verde', 'green', 'militar'] },
  { re: /verde|green|jade|menta/i,           pt: 'verde',            native: 'green',  tokens: ['verde', 'green', 'jade', 'menta'] },
  { re: /petr[oó]leo|teal|turquesa/i,        pt: 'azul petróleo',    native: 'blue',   tokens: ['petroleo', 'petróleo', 'teal', 'turquesa', 'azul', 'blue'] },
  { re: /azul|blue|indigo|índigo|celeste/i,  pt: 'azul',             native: 'blue',   tokens: ['azul', 'blue', 'indigo', 'índigo'] },
  { re: /lil[aá]s|lavanda|lavender|lilac/i,  pt: 'lilás',            native: 'violet', tokens: ['lilás', 'lilas', 'lavanda', 'lavender', 'lilac', 'roxo'] },
  { re: /roxo|violeta|purple|ameixa|uva/i,   pt: 'roxo',             native: 'violet', tokens: ['roxo', 'violeta', 'purple', 'ameixa'] },
  { re: /rosa|pink|blush|malva|mauve|ros[eé]/i, pt: 'rosa',          native: 'pink',   tokens: ['rosa', 'pink', 'blush', 'malva', 'mauve'] },
  { re: /grafite|chumbo|charcoal|cinza|gray|grey|prata|silver/i, pt: 'cinza', native: 'gray', tokens: ['cinza', 'grafite', 'charcoal', 'gray', 'grey', 'prata'] },
];

function matchColorRule(raw: unknown): ColorRule | null {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.trim()) return null;
  for (const rule of COLOR_RULES) if (rule.re.test(s)) return rule;
  return null;
}

const TECIDO_TEXT_RULES: Array<{ re: RegExp; key: TecidoKey }> = [
  { re: /cashmere|caxemira/i,               key: 'cashmere' },
  { re: /alfaiataria|l[ãa]\s*fria|\bl[ãa]\b|wool|tweed/i, key: 'la_alfaiataria' },
  { re: /linho|linen/i,                     key: 'linho' },
  { re: /cetim|satin/i,                     key: 'cetim' },
  { re: /seda|silk/i,                       key: 'seda' },
  { re: /crepe|cr[êe]pe/i,                  key: 'crepe' },
  { re: /veludo|cotel[êe]|velvet/i,         key: 'veludo' },
  { re: /couro|leather|suede|camur[çc]a/i,  key: 'couro' },
  { re: /jeans|denim|sarja/i,               key: 'jeans' },
  { re: /tric[ôo]|knit|malha\s*canelada/i,  key: 'trico_fino' },
  { re: /malha|jersey|modal|viscose/i,      key: 'malha_canelada' },
  { re: /algod[ãa]o|cotton|pima|popeline/i, key: 'algodao' },
];

function matchTecidoText(raw: unknown): TecidoKey | null {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.trim()) return null;
  for (const rule of TECIDO_TEXT_RULES) if (rule.re.test(s)) return rule.key;
  return null;
}

function flattenStrings(v: unknown, depth = 0): string[] {
  if (depth > 3 || v == null) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap((x) => flattenStrings(x, depth + 1));
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.nome === 'string') return [o.nome];
    if (typeof o.cor === 'string') return [o.cor];
    if (typeof o.texto === 'string') return [o.texto];
    return Object.values(o).flatMap((x) => flattenStrings(x, depth + 1));
  }
  return [];
}

export interface DossierAnchors {
  colorFrag?: string;
  colorTokens?: string[];
  nativeColor?: NativeColor;
  tecido?: TecidoKey;
  coresEvitar?: string[];
}

/**
 * Extrai do DOSSIÊ REAL a cor-âncora (paleta da pessoa) e o tecido-âncora
 * (tecidos recomendados). Usado para que toda imagem do dossiê fale a mesma
 * língua do texto gerado pela IA.
 */
export function resolveDossierAnchors(
  colorAnalysis?: Record<string, unknown> | null,
  modelingAnalysis?: Record<string, unknown> | null,
): DossierAnchors {
  const out: DossierAnchors = {};

  const ca = (colorAnalysis || {}) as Record<string, unknown>;
  const paleta = (ca.paleta_cores_ideais || {}) as Record<string, unknown>;
  const colorCandidates = [
    ...flattenStrings(paleta.cores_base),
    ...flattenStrings(paleta.cores_destaque),
    ...flattenStrings(ca.cores_ideais),
    ...flattenStrings(paleta.neutros),
  ];
  for (const c of colorCandidates) {
    const rule = matchColorRule(c);
    if (rule) {
      out.colorFrag = rule.pt;
      out.colorTokens = rule.tokens;
      out.nativeColor = rule.native;
      break;
    }
  }

  const evitar = flattenStrings(ca.cores_evitar)
    .map((c) => matchColorRule(c)?.pt)
    .filter((x): x is string => Boolean(x));
  if (evitar.length) out.coresEvitar = Array.from(new Set(evitar));

  const ma = (modelingAnalysis || {}) as Record<string, unknown>;
  const fabricCandidates = [
    ...flattenStrings(ma.tecidos_recomendados),
    ...flattenStrings(ma.tecidos_ideais),
  ];
  for (const f of fabricCandidates) {
    const key = matchTecidoText(f);
    if (key) { out.tecido = key; break; }
  }

  return out;
}

/**
 * Assinatura congelada ENRIQUECIDA com as âncoras reais do dossiê.
 * Cai de volta na assinatura genérica quando o dossiê ainda não tem dados.
 */
export function resolveSignatureWithDossier(
  d: DiagnosticData | null | undefined,
  q: Record<string, unknown> | null | undefined,
  anchors: DossierAnchors,
): DiagnosisSignature & { colorTokens?: string[]; nativeColor?: NativeColor; coresEvitar?: string[] } {
  const base = resolveDiagnosisSignature(d, q);
  const tecidoResolved = anchors.tecido ?? base.tecidoResolved;
  return {
    ...base,
    tecidoResolved,
    fabricFrag: cleanFragExternal(TECIDO_FRAGMENT[tecidoResolved], 2),
    colorFrag: anchors.colorFrag ?? base.colorFrag,
    colorTokens: anchors.colorTokens,
    nativeColor: anchors.nativeColor,
    coresEvitar: anchors.coresEvitar,
  };
}
