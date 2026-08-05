// ============================================================
// Dicionário FIXO PT→PT para queries de PEÇA de guarda-roupa.
//
// REFATORAÇÃO: agora aceita um `DiagnosisImageProfile` (ver
// imageDiagnosisProfile.ts) como fallback de cor/tecido. Antes, se o
// nome da peça não mencionava cor ("blusa drapeada"), a query saía
// sem cor nenhuma — inconsistente com o resto do dossiê. Agora, na
// ausência de cor/tecido explícitos na peça, usamos SEMPRE a cor e o
// tecido âncora do diagnóstico, garantindo que peça, look e seção
// falem a mesma "língua visual".
//
// Todas as queries continuam em português (DuckDuckGo indexa bem PT-BR
// de moda) e SEMPRE terminam com uma âncora feminina explícita.
// ============================================================

import type { DiagnosisImageProfile } from './imageDiagnosisProfile';

const TIPO_MAP: Array<[RegExp, string]> = [
  [/coturno|combat/i, 'bota coturno'],
  [/bota/i, 'bota'],
  [/mocassim|loafer/i, 'mocassim'],
  [/scarpin/i, 'scarpin'],
  [/mule/i, 'mule'],
  [/rasteirinha/i, 'rasteirinha'],
  [/sandalia|sandália/i, 'sandália'],
  [/sapatilha/i, 'sapatilha'],
  [/oxford|derby/i, 'oxford'],
  [/slingback/i, 'slingback'],
  [/t[êe]nis/i, 'tênis'],
  [/papete/i, 'papete'],
  [/sapato/i, 'sapato'],
  [/clutch/i, 'clutch'],
  [/mochila/i, 'mochila'],
  [/pochete|belt bag/i, 'pochete'],
  [/bolsa/i, 'bolsa'],
  [/carteira/i, 'carteira'],
  [/chap[eé]u/i, 'chapéu'],
  [/boina|beret/i, 'boina'],
  [/len[cç]o/i, 'lenço de seda'],
  [/cinto/i, 'cinto'],
  [/[oó]culos/i, 'óculos de sol'],
  [/cal[çc]a\s+cargo/i, 'calça cargo'],
  [/cal[çc]a\s+jeans|jeans\b/i, 'calça jeans'],
  [/legging/i, 'legging'],
  [/pantalona|palazzo/i, 'calça pantalona'],
  [/cal[çc]a/i, 'calça'],
  [/saia/i, 'saia'],
  [/bermuda/i, 'bermuda'],
  [/shorts?\b/i, 'shorts'],
  [/vestido/i, 'vestido'],
  [/macac[ãa]o/i, 'macacão'],
  [/macaquinho|romper/i, 'macaquinho'],
  [/regata/i, 'regata'],
  [/camiseta|t[- ]?shirt/i, 'camiseta'],
  [/camisa/i, 'camisa'],
  [/body\b|bodysuit/i, 'body'],
  [/polo/i, 'polo'],
  [/moletom|moleton|hoodie/i, 'moletom'],
  [/tric[oô]|malha|su[eé]ter|cardig[ãa]/i, 'tricô'],
  [/colete/i, 'colete'],
  [/kimono/i, 'kimono'],
  [/cropped/i, 'cropped'],
  [/blusa|top\b/i, 'blusa'],
  [/blazer|terceira.?pe[çc]a/i, 'blazer'],
  [/trench/i, 'trench coat'],
  [/sobretudo|overcoat/i, 'sobretudo'],
  [/parka/i, 'parka'],
  [/jaqueta/i, 'jaqueta'],
  [/casaco/i, 'casaco'],
];

const CORTE_MAP: Array<[RegExp, string]> = [
  [/cintura\s*alta|high[- ]?waist/i, 'cintura alta'],
  [/cintura\s*baixa|low[- ]?rise/i, 'cintura baixa'],
  [/cropped/i, 'cropped'],
  [/oversized/i, 'oversized'],
  [/alfaiataria|tailored/i, 'alfaiataria'],
  [/wide[- ]?leg|pantalona/i, 'pantalona'],
  [/skinny/i, 'skinny'],
  [/slim/i, 'slim'],
  [/flat\b/i, 'flat'],
  [/pointed\b/i, 'pointed toe'],
  [/stiletto\b/i, 'stiletto'],
  [/kitten\b/i, 'kitten heel'],
  [/block\b/i, 'block heel'],
  [/slip[- ]?on|slipon/i, 'slip on'],
  [/reto|reta|straight/i, 'reta'],
  [/pleated|plissad[oa]/i, 'plissada'],
  [/eva[sz][êe]|a[- ]?line|god[êe]/i, 'evasê'],
  [/mom\b/i, 'mom'],
  [/boyfriend/i, 'boyfriend'],
  [/flare/i, 'flare'],
  [/cargo/i, 'cargo'],
  [/jogger/i, 'jogger'],
  [/midi/i, 'midi'],
  [/mini\b/i, 'mini'],
  [/maxi/i, 'maxi'],
  [/longo|longa|long\b/i, 'longa'],
  [/curto|curta/i, 'curta'],
  [/estruturad[oa]|structured/i, 'estruturada'],
  [/fluid[oa]|flowy|drapead[oa]/i, 'drapeada'],
];

const TECIDO_MAP: Array<[RegExp, string]> = [
  [/seda|silk/i, 'seda'],
  [/cetim|satin/i, 'cetim'],
  [/linho|linen/i, 'linho'],
  [/cashmere/i, 'cashmere'],
  [/tric[oô]|malha canelada/i, 'tricô'],
  [/couro|leather/i, 'couro'],
  [/camur[çc]a|suede/i, 'camurça'],
  [/veludo|velvet/i, 'veludo'],
  [/algod[ãa]o|cotton/i, 'algodão'],
  [/jeans|denim/i, 'jeans'],
  [/l[ãa]|wool/i, 'lã'],
  [/crepe/i, 'crepe'],
];

const COR_MAP: Array<[RegExp, string]> = [
  [/off.?white|branco\s*(quebrad|frio|gelo)/i, 'off white'],
  [/branco/i, 'branco'],
  [/preto|black/i, 'preto'],
  [/cinza\s*(chumbo|escur)/i, 'cinza chumbo'],
  [/cinza/i, 'cinza'],
  [/bege|nude/i, 'bege'],
  [/creme|ecru|marfim/i, 'creme'],
  [/marinho|navy/i, 'azul marinho'],
  [/azul.?petr[oó]leo/i, 'azul petróleo'],
  [/azul.?anil|[ií]ndigo/i, 'azul índigo'],
  [/azul.?claro|sky|c[eé]u/i, 'azul claro'],
  [/turquesa|turquoise/i, 'turquesa'],
  [/azul/i, 'azul'],
  [/verde.?oliva|oliva/i, 'verde oliva'],
  [/esmeralda|emerald/i, 'verde esmeralda'],
  [/verde.?musgo|musgo|sage/i, 'verde musgo'],
  [/verde/i, 'verde'],
  [/vinho|bord[oô]|burgundy/i, 'vinho'],
  [/vermelho|red\b/i, 'vermelho'],
  [/terracota|terracotta|laranja.?queimad/i, 'terracota'],
  [/coral/i, 'coral'],
  [/caramelo|camel/i, 'caramelo'],
  [/mostarda|mustard/i, 'mostarda'],
  [/dourad|gold/i, 'dourado'],
  [/marrom|chocolate|brown/i, 'marrom'],
  [/tabaco|tan\b/i, 'tabaco'],
  [/amarelo|yellow/i, 'amarelo'],
  [/rosa\s*(claro|beb[eê])|blush/i, 'rosa claro'],
  [/rosa|pink/i, 'rosa'],
  [/lil[aá]s|lavanda|lavender/i, 'lilás'],
  [/roxo|violeta|violet|plum/i, 'roxo'],
  [/magenta/i, 'magenta'],
];

const NATIVE_COLOR_MAP: Record<string, string> = {
  'off white': 'white', branco: 'white', creme: 'white',
  preto: 'black', 'cinza chumbo': 'black', cinza: 'gray',
  bege: 'brown', caramelo: 'brown', tabaco: 'brown', marrom: 'brown',
  'azul marinho': 'blue', 'azul petróleo': 'blue', 'azul índigo': 'blue',
  'azul claro': 'blue', turquesa: 'turquoise', azul: 'blue',
  'verde oliva': 'green', 'verde esmeralda': 'green', 'verde musgo': 'green', verde: 'green',
  vinho: 'red', vermelho: 'red', terracota: 'orange', coral: 'orange',
  mostarda: 'yellow', dourado: 'yellow', amarelo: 'yellow',
  'rosa claro': 'pink', rosa: 'pink', magenta: 'pink',
  lilás: 'violet', roxo: 'violet',
};

// EN → PT reverso, usado só para traduzir o fallback vindo do DiagnosisImageProfile
// (que guarda cor/tecido em inglês) de volta para PT antes de montar a query.
const COLOR_EN_TO_PT: Record<string, string> = {
  'off-white': 'off white', ecru: 'creme', black: 'preto', charcoal: 'cinza chumbo',
  grey: 'cinza', gray: 'cinza', navy: 'azul marinho', 'petrol blue': 'azul petróleo',
  indigo: 'azul índigo', blue: 'azul', turquoise: 'turquesa', olive: 'verde oliva',
  emerald: 'verde esmeralda', 'sage green': 'verde musgo', burgundy: 'vinho', red: 'vermelho',
  terracotta: 'terracota', coral: 'coral', mustard: 'mostarda', gold: 'dourado',
  rose: 'rosa claro', pink: 'rosa', magenta: 'magenta', lavender: 'lilás', plum: 'roxo',
  beige: 'bege', brown: 'marrom', camel: 'caramelo',
};

const FABRIC_EN_TO_PT: Record<string, string> = {
  silk: 'seda', satin: 'cetim', cashmere: 'cashmere', wool: 'lã', linen: 'linho',
  cotton: 'algodão', knit: 'tricô', leather: 'couro', suede: 'camurça', velvet: 'veludo',
  crepe: 'crepe', denim: 'jeans',
};

export interface PieceQuery {
  query: string;
  nativeColor: string | null;
  meta: { tipo: string; corte: string | null; cor: string | null; kind: PieceKind };
}

export type PieceKind = 'apparel' | 'footwear' | 'bag' | 'accessory';

const FOOTWEAR_TIPOS = new Set([
  'bota coturno', 'bota', 'mocassim', 'scarpin', 'mule', 'rasteirinha',
  'sandália', 'sapatilha', 'oxford', 'slingback', 'tênis', 'papete', 'sapato',
]);
const BAG_TIPOS = new Set(['clutch', 'mochila', 'pochete', 'bolsa', 'carteira']);
const ACCESSORY_TIPOS = new Set(['chapéu', 'boina', 'lenço de seda', 'cinto', 'óculos de sol']);

function kindOf(tipo: string, categoryKey?: string): PieceKind {
  if (categoryKey === 'calcados' || FOOTWEAR_TIPOS.has(tipo)) return 'footwear';
  if (categoryKey === 'bolsas' || BAG_TIPOS.has(tipo)) return 'bag';
  if (ACCESSORY_TIPOS.has(tipo)) return 'accessory';
  return 'apparel';
}

function firstMatch(map: Array<[RegExp, string]>, input: string): string | null {
  for (const [rx, pt] of map) if (rx.test(input)) return pt;
  return null;
}

/**
 * Traduz "Blusa drapeada de seda rosa" → "blusa drapeada seda rosa feminina moda".
 * Quando a peça NÃO especifica cor/tecido, usa o `profile` (perfil único do
 * diagnóstico) como fallback — nunca deixa a query sair "sem tempero" e nunca
 * diverge da cor/tecido usados no resto do dossiê.
 */
export function buildPieceQuery(
  pieceName: string,
  colorHintPT?: string | null,
  categoryKey?: string,
  _styleHint?: string | null,
  profile?: DiagnosisImageProfile | null,
): PieceQuery {
  const raw = (pieceName || '').trim();
  const rawLower = raw.toLowerCase();
  const matchedTipo = firstMatch(TIPO_MAP, raw);
  const tipo = matchedTipo
    ?? (categoryKey === 'calcados' ? 'sapato'
      : categoryKey === 'bolsas' ? 'bolsa'
      : categoryKey === 'tercas_pecas' ? 'blazer'
      : categoryKey === 'vestidos' ? 'vestido'
      : categoryKey === 'bottoms' ? 'calça'
      : categoryKey === 'tops' ? 'blusa'
      : 'look');
  const corte = firstMatch(CORTE_MAP, raw);
  let tecido = firstMatch(TECIDO_MAP, raw);
  let corPT = firstMatch(COR_MAP, raw) ?? (colorHintPT ? firstMatch(COR_MAP, colorHintPT) : null);

  // Fallback pro perfil único do diagnóstico — SÓ quando a peça não trouxe
  // cor/tecido próprios. Isso é o que garante consistência visual.
  if (!corPT && profile) corPT = COLOR_EN_TO_PT[profile.colorEN] ?? null;
  if (!tecido && profile) tecido = FABRIC_EN_TO_PT[profile.fabricEN] ?? null;

  const nativeColor = corPT ? (NATIVE_COLOR_MAP[corPT] ?? null) : (profile?.colorNative ?? null);
  const kind = kindOf(tipo, categoryKey);

  const queryParts = profile
    ? [tipo, corte, tecido, corPT, 'feminina', 'moda']
    : [tipo, corPT, 'moderno', 'woman'];
  const query = queryParts.join(' ').replace(/\s+/g, ' ').trim();

  return { query, nativeColor, meta: { tipo, corte, cor: corPT, kind } };
}

export function buildSectionQueryLadder(section: string, profile: DiagnosisImageProfile): string[] {
  const color = profile.colorEN;
  const fabric = profile.fabricEN;
  const style = profile.styleEN;
  const normalizedSection = section?.toLowerCase() || 'look';

  switch (normalizedSection) {
    case 'estilo':
      return [
        `${style} ${color} ${fabric} outfit woman fashion product shot isolated white background`,
        `${style} ${color} outfit woman fashion product shot isolated`,
        `${color} outfit woman fashion product shot isolated white background`,
        'woman fashion outfit product shot isolated white background',
      ];
    case 'textura':
      return [
        `${fabric} fabric texture close up ${color} fashion woman product shot isolated white background`,
        `${fabric} fabric texture close up fashion woman product shot isolated`,
        `${color} fabric swatch fashion woman product shot isolated`,
        'fabric texture fashion woman product shot isolated',
      ];
    case 'capsula':
      return [
        `capsule wardrobe ${style} ${color} woman clothes flat lay product shot isolated white background`,
        `capsule wardrobe woman clothes flat lay product shot isolated`,
        `${style} wardrobe clothes flat lay woman fashion product shot isolated`,
        'woman fashion wardrobe flat lay product shot isolated',
      ];
    case 'viagem':
      return [
        `travel outfit ${style} ${color} woman airport fashion product shot isolated white background`,
        'travel outfit woman airport fashion product shot isolated',
        'woman travel fashion outfit product shot isolated',
        'woman travel outfit product shot isolated',
      ];
    case 'moodboard':
      return [
        `${style} fashion editorial ${color} ${fabric} moodboard woman product shot isolated white background`,
        `${style} fashion editorial woman product shot isolated`,
        'woman fashion editorial moodboard product shot isolated',
        'woman fashion editorial product shot isolated',
      ];
    case 'look':
    default:
      return [
        `${style} ${color} ${fabric} outfit woman full body fashion product shot isolated white background`,
        `${style} ${color} outfit woman fashion product shot isolated`,
        `${color} outfit woman fashion product shot isolated white background`,
        'woman fashion outfit product shot isolated white background',
      ];
  }
}

/** Ladder PT: com cor → sem cor → tipo+âncora → âncora de categoria. */
export function buildPieceQueryLadder(q: PieceQuery, categoryKey?: string): string[] {
  const { tipo, corte, kind } = q.meta;
  const isApparel = kind === 'apparel';
  const anchor = isApparel ? 'feminina moda' : 'feminino produto';

  const withColor = q.query;
  const withoutColor = `${tipo} moderno woman`;
  const tipoOnly = `${tipo} moderno woman`;
  const catFallback = categoryKey === 'calcados' ? 'sapato moderno woman'
    : categoryKey === 'bolsas' ? 'bolsa moderno woman'
    : categoryKey === 'tercas_pecas' ? 'blazer moderno woman'
    : categoryKey === 'vestidos' ? 'vestido moderno woman'
    : categoryKey === 'bottoms' ? `${tipo} moderno woman`
    : categoryKey === 'tops' ? `${tipo} moderno woman`
    : `${tipo} moderno woman`;

  const seen = new Set<string>();
  return [withColor, withoutColor, tipoOnly, catFallback].filter((s) => {
    const k = s.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
