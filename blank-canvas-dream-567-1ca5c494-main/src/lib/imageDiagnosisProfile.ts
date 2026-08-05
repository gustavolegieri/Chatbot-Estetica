// ============================================================
// PERFIL DE IMAGEM ÚNICO POR DIAGNÓSTICO
// ============================================================
// PROBLEMA QUE ESTE ARQUIVO RESOLVE:
// Antes, cada busca de imagem (peça individual, look, seção) extraía
// cor/tecido/paleta de formas DIFERENTES e em momentos DIFERENTES —
// uma peça podia sair "azul índigo" e o hero look do mesmo diagnóstico
// sair "rosa claro", porque cada hook fazia sua própria extração ad-hoc
// a partir de textos livres diferentes (nome da peça vs. diagnóstico
// completo vs. questionário). Isso quebra a coerência visual do dossiê.
//
// SOLUÇÃO:
// Um único ponto de verdade — `getDiagnosisImageProfile()` — que:
//   1. Lê o diagnóstico (color_analysis, style_analysis, questionnaire)
//   2. Normaliza para EXATAMENTE uma cor, um tecido, uma paleta e um
//      estilo em inglês (idioma que os provedores de imagem indexam melhor)
//   3. Cacheia o resultado em memória por diagnosisId — chamado 100x
//      no mesmo diagnóstico, sempre devolve os MESMOS valores.
//
// Qualquer novo hook/edge function que precise montar uma query de
// imagem para este projeto DEVE consumir este perfil, não reinventar
// a extração de cor/tecido na mão.
// ============================================================

export interface DiagnosisImageProfile {
  diagnosisId: string;

  /** UMA cor âncora, em inglês simples, usada em TODAS as queries deste diagnóstico. */
  colorEN: string;
  /** Mesma cor, mapeada para o parâmetro nativo `color=` das APIs (subconjunto restrito). */
  colorNative: string;

  /** UM tecido âncora, em inglês, usado quando a peça/seção não especifica outro. */
  fabricEN: string;

  /** Rótulo curto de paleta/estação, em inglês, para queries de textura/mood. */
  paletteLabelEN: string;

  /** Estilo predominante, em inglês (ex.: "modern minimalist"). */
  styleEN: string;

  /** Âncora de gênero — SEMPRE presente, nunca omitida em nenhuma query do projeto. */
  genderAnchor: 'woman';

  /** Termos que NUNCA podem aparecer no texto/alt de uma imagem aceita para este diagnóstico. */
  hardNegatives: string[];

  /** Metadata bruta para debug/log. */
  debug: {
    rawSkinTone: string | null;
    rawStyle: string | null;
    rawColorSource: string | null;
    rawFabricSource: string | null;
  };
}

// ---------------------------------------------------------------
// Cache em memória — vive enquanto a aba estiver aberta. Garante que
// buscas repetidas do mesmo diagnosisId nunca "flutuem" de valor.
// ---------------------------------------------------------------
const profileCache = new Map<string, DiagnosisImageProfile>();

// ---------------------------------------------------------------
// Mapas de normalização PT/EN — cor, tecido, estilo.
// Mantidos aqui (não importados de pieceFragments.ts) para que este
// módulo não dependa de nenhum outro arquivo do projeto e possa ser
// copiado 1:1 para dentro de uma edge function Deno se necessário.
// ---------------------------------------------------------------
const COLOR_TO_EN: Array<[RegExp, string]> = [
  [/off.?white|branco\s*(quebrado|frio|gelo)?/i, 'off-white'],
  [/preto|black/i, 'black'],
  [/cinza\s*(chumbo|escuro)|charcoal/i, 'charcoal'],
  [/cinza|grey|gray/i, 'grey'],
  [/marinho|navy/i, 'navy'],
  [/azul.?petr[oó]leo/i, 'petrol blue'],
  [/azul.?anil|[ií]ndigo|indigo/i, 'indigo'],
  [/azul|blue/i, 'blue'],
  [/turquesa|turquoise/i, 'turquoise'],
  [/verde.?oliva|oliva|olive/i, 'olive'],
  [/esmeralda|emerald/i, 'emerald'],
  [/verde|green|sage/i, 'sage green'],
  [/vinho|bord[oô]|burgundy/i, 'burgundy'],
  [/terracota|terracotta/i, 'terracotta'],
  [/coral/i, 'coral'],
  [/caramelo|camel/i, 'camel'],
  [/marrom|chocolate|brown/i, 'brown'],
  [/bege|nude|beige/i, 'beige'],
  [/creme|ecru|ivory/i, 'ecru'],
  [/mostarda|mustard/i, 'mustard'],
  [/dourad|gold/i, 'gold'],
  [/rosa\s*(claro|beb[eê])|blush|rose/i, 'rose'],
  [/rosa|pink/i, 'pink'],
  [/lil[aá]s|lavanda|lavender/i, 'lavender'],
  [/roxo|violeta|violet|plum/i, 'plum'],
  [/magenta/i, 'magenta'],
  [/vermelho|red/i, 'red'],
];

const COLOR_EN_TO_NATIVE: Record<string, string> = {
  'off-white': 'white', ecru: 'white', beige: 'brown', camel: 'brown', brown: 'brown',
  black: 'black', charcoal: 'black', grey: 'gray', navy: 'blue', 'petrol blue': 'blue',
  indigo: 'blue', blue: 'blue', turquoise: 'turquoise', olive: 'green', emerald: 'green',
  'sage green': 'green', burgundy: 'red', red: 'red', terracotta: 'orange', coral: 'orange',
  mustard: 'yellow', gold: 'yellow', rose: 'pink', pink: 'pink', magenta: 'pink',
  lavender: 'violet', plum: 'violet',
};

const FABRIC_TO_EN: Array<[RegExp, string]> = [
  [/seda|silk/i, 'silk'],
  [/cetim|satin/i, 'satin'],
  [/cashmere/i, 'cashmere'],
  [/lã\s*fria|wool/i, 'wool'],
  [/linho|linen/i, 'linen'],
  [/algod[ãa]o|cotton/i, 'cotton'],
  [/tric[oô]|malha|knit/i, 'knit'],
  [/couro|leather/i, 'leather'],
  [/camur[çc]a|suede/i, 'suede'],
  [/veludo|velvet/i, 'velvet'],
  [/crepe/i, 'crepe'],
  [/jeans|denim/i, 'denim'],
];

// Estilo predominante PT → EN. Espelha STYLE_EN de imageTranslations.ts,
// mantido duplicado aqui de propósito (ver comentário do módulo acima).
const STYLE_TO_EN: Array<[RegExp, string]> = [
  [/cl[aá]ssico/i, 'classic'],
  [/moderno/i, 'modern'],
  [/minimalista/i, 'minimalist'],
  [/natural/i, 'natural'],
  [/rom[aâ]ntico/i, 'romantic'],
  [/dram[aá]tico/i, 'dramatic'],
  [/criativo|criadora/i, 'creative'],
  [/sensual/i, 'sensual'],
  [/esportivo|sporty/i, 'sporty'],
  [/boh[eê]mio|boho/i, 'bohemian'],
  [/elegante/i, 'elegant'],
];

/** Aplica a primeira regex que casar; senão devolve null. */
function firstMatch(map: Array<[RegExp, string]>, input: string | null | undefined): string | null {
  if (!input) return null;
  for (const [rx, en] of map) if (rx.test(input)) return en;
  return null;
}

/** Busca o primeiro valor mapeado a partir de uma lista de fontes em ordem de prioridade. */
function firstMatchInPriority(map: Array<[RegExp, string]>, ...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    const matched = firstMatch(map, input);
    if (matched) return matched;
  }
  return null;
}

/** Junta vários campos texto/array em uma única string pesquisável, tolerando formatos variados. */
function flattenSearchable(...values: unknown[]): string {
  const parts: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === 'string').join(' '));
    else if (typeof v === 'object') {
      try { parts.push(JSON.stringify(v)); } catch { /* noop */ }
    }
  }
  return parts.join(' ');
}

/** Lê a primeira chave existente dentre várias candidatas (schema do questionário não é 100% fixo). */
function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

/** Deriva a paleta/estação a partir do subtom + contraste + paleta declarada no questionário. */
function derivePaletteLabel(
  skinTone: string | null,
  contrast: string | null,
  questionnairePaletteHint?: string | null,
): string {
  const tone = (skinTone || '').toLowerCase();
  const cst = (contrast || '').toLowerCase();
  const hint = (questionnairePaletteHint || '').toLowerCase();

  if (/paleta_fria|frios|frio|cool|winter|navy|marinho/.test(hint)) {
    return /alto|high/.test(cst) ? 'cool high-contrast winter palette' : 'cool soft winter palette';
  }
  if (/paleta_rose|rose|rosa|blush|terracota/.test(hint)) {
    return 'soft rose blush terracotta palette';
  }
  if (/paleta_vibrante|vibrante|joia|jewel|bright/.test(hint)) {
    return 'vibrant jewel tone palette';
  }
  if (/paleta_neutra|neutro|neutral|camel|beige|warm/.test(hint)) {
    return /alto|high/.test(cst) ? 'warm neutral camel palette' : 'warm neutral beige palette';
  }
  if (/frio|cool/.test(tone)) {
    return /alto|high/.test(cst) ? 'cool high-contrast winter palette' : 'cool soft winter palette';
  }
  if (/quente|warm/.test(tone)) {
    return /alto|high/.test(cst) ? 'warm vivid autumn palette' : 'warm soft autumn palette';
  }
  if (/oliva|olive/.test(tone)) return 'olive-toned neutral palette';
  return 'neutral balanced palette';
}

export interface BuildProfileInput {
  diagnosisId: string;
  /** diagnoses.color_analysis */
  colorAnalysis?: Record<string, unknown> | null;
  /** diagnoses.style_analysis */
  styleAnalysis?: Record<string, unknown> | null;
  /** diagnoses.questionnaire */
  questionnaire?: Record<string, unknown> | null;
  /** diagnoses.skin_tone (coluna direta, quando existir) */
  skinTone?: string | null;
}

/**
 * Ponto único de entrada. SEMPRE usar esta função em vez de extrair
 * cor/tecido/paleta manualmente em qualquer hook ou edge function novos.
 */
export function getDiagnosisImageProfile(input: BuildProfileInput): DiagnosisImageProfile {
  const cached = profileCache.get(input.diagnosisId);
  if (cached) return cached;

  const { colorAnalysis, styleAnalysis, questionnaire, skinTone } = input;

  // --- Cor -------------------------------------------------------
  // Ordem de prioridade: (1) coloração pessoal calculada,
  // (2) respostas explícitas do questionário (cores favoritas, cores que brilham,
  // paleta escolhida), (3) paleta psicométrica, (4) fallback fixo.
  const psychometric = (questionnaire?.psicometrico as Record<string, unknown> | null) ?? null;
  const questionnaireColorText = flattenSearchable(
    pick(questionnaire, ['coresQueAma', 'coresQueTeFazemBrilhar', 'coresQueMaisCombinam', 'cores_que_brilham', 'brightColors', 'coresPreferidas']),
    pick(questionnaire, ['paletaPreferida', 'palette_choice', 'colorPaletteChoice', 'paletaEscolhida']),
    pick(psychometric, ['paleta']),
  );
  const colorAnalysisText = flattenSearchable(
    pick(colorAnalysis, ['cores', 'colors', 'palette', 'coresRecomendadas']),
  );
  const colorEN = firstMatchInPriority(COLOR_TO_EN, questionnaireColorText, colorAnalysisText) || 'navy';
  const colorNative = COLOR_EN_TO_NATIVE[colorEN] || 'blue';

  // --- Tecido ------------------------------------------------------
  const questionnaireFabricText = flattenSearchable(
    pick(questionnaire, ['tecidosPreferidos', 'tecidosQueAma', 'tecidosQueMaisGosta', 'tecidosFavoritos', 'tecidos_favoritos', 'fabricsLoved', 'materiaisPreferidos']),
  );
  const styleAnalysisFabricText = flattenSearchable(
    pick(styleAnalysis, ['tecidosRecomendados', 'fabrics', 'recommendedFabrics']),
  );
  const fabricEN = firstMatchInPriority(FABRIC_TO_EN, questionnaireFabricText, styleAnalysisFabricText) || 'wool';

  // --- Estilo --------------------------------------------------------
  const questionnaireStyleText = flattenSearchable(
    pick(questionnaire, ['estiloPreferido', 'estiloPredominante', 'preferenciaRoupas', 'comoSeVeste']),
    pick(psychometric, ['estilo']),
  );
  const styleAnalysisText = flattenSearchable(
    pick(styleAnalysis, ['estiloPersonalidade', 'predominantStyle', 'style']),
  );
  const styleEN = firstMatchInPriority(STYLE_TO_EN, questionnaireStyleText, styleAnalysisText) || 'modern';

  // --- Paleta / estação -----------------------------------------------
  const rawSkinTone = skinTone
    || (typeof pick(colorAnalysis, ['tomDePele', 'skinTone']) === 'string'
      ? (pick(colorAnalysis, ['tomDePele', 'skinTone']) as string) : null)
    || (typeof pick(questionnaire, ['subtom', 'skinTone']) === 'string' ? (pick(questionnaire, ['subtom', 'skinTone']) as string) : null);
  const analysisContrast = pick(colorAnalysis, ['contraste', 'contrast']);
  const questionnaireContrast = pick(questionnaire, ['contraste']);
  const rawContrast = typeof analysisContrast === 'string'
    ? analysisContrast
    : typeof questionnaireContrast === 'string' ? questionnaireContrast : null;
  const questionnairePaletteHint = pick(questionnaire, ['paletaPreferida', 'palette_choice', 'colorPaletteChoice', 'paletaEscolhida'])
    ?? pick(psychometric, ['paleta']);
  const paletteLabelEN = derivePaletteLabel(rawSkinTone, rawContrast, typeof questionnairePaletteHint === 'string' ? questionnairePaletteHint : null);

  const profile: DiagnosisImageProfile = {
    diagnosisId: input.diagnosisId,
    colorEN,
    colorNative,
    fabricEN,
    paletteLabelEN,
    styleEN,
    genderAnchor: 'woman',
    // Reforço redundante do filtro feminino — usado tanto no client quanto
    // repassado para a edge function, além do filtro que ela já faz sozinha.
    hardNegatives: [
      'man', 'men', 'male', 'menswear', 'boy', 'father', 'husband', 'groom',
      'child', 'kid', 'baby', 'cartoon', 'anime', 'ai generated', 'stable diffusion',
      'watermark', 'stock photo', 'getty', 'shutterstock',
      // Visual noise / non-clothing objects commonly returned by broad queries
      'glass', 'bottle', 'cup', 'drink', 'beverage', 'glassware', 'goblet', 'vase',
      'flower', 'floral', 'food', 'plate', 'table', 'kitchen', 'utensil',
      'toy', 'vehicle', 'car', 'cart', 'stroller', 'wheel',
      // editorial / portrait noise
      'portrait', 'face', 'selfie', 'closeup', 'hands', 'holding', 'product in hand',
    ],
    debug: {
      rawSkinTone: rawSkinTone ?? null,
      rawStyle: questionnaireStyleText || styleAnalysisText || null,
      rawColorSource: questionnaireColorText || colorAnalysisText || null,
      rawFabricSource: questionnaireFabricText || styleAnalysisFabricText || null,
    },
  };

  profileCache.set(input.diagnosisId, profile);
  return profile;
}

/** Limpa o cache de um diagnóstico específico (usar se o diagnóstico for reprocessado). */
export function invalidateDiagnosisImageProfile(diagnosisId: string): void {
  profileCache.delete(diagnosisId);
}
