export type DiagnosticImageMode = 'product' | 'editorial';

export interface DiagnosticImageContractInput {
  diagnosisId?: string | null;
  section: string;
  variant?: string;
  tileIndex?: number;
  variantIndex?: number;
  pieceName?: string;
  category?: string;
  style?: string | null;
  color?: string | null;
  fabric?: string | null;
  excludedColors?: string[];
  mode?: DiagnosticImageMode;
}

export interface DiagnosticImageContract {
  identity: string;
  query: string;
  alternateQueries: string[];
  requiredTerms: string[];
  requiredColorTerms: string[];
  requiredFabricTerms: string[];
  mode: DiagnosticImageMode;
  nativeColor: string | null;
  normalizedColor: string;
  normalizedFabric: string;
  normalizedStyle: string;
  normalizedCategory: string;
}

type Rule = { rx: RegExp; label: string; en: string; native?: string; synonyms: string[]; category?: string };

const COLOR_RULES: Rule[] = [
  // "navy claro" é uma combinação gerada por diagnósticos legados. Trate-a
  // como azul médio; exigir pixels de azul-marinho escuro elimina calçados
  // realmente azuis e deixa o slot sem fotografia.
  { rx: /navy\s*(claro|light)|azul[\s-]*marinho\s*(claro|light)/i, label: 'azul-médio', en: 'blue', native: 'blue', synonyms: ['blue', 'cobalt blue'] },
  { rx: /azul[\s-]*marinho|navy/i, label: 'azul-marinho', en: 'navy blue', native: 'blue', synonyms: ['navy', 'navy blue', 'azul marinho', 'azul-marinho'] },
  { rx: /azul\s*petr[oó]leo|petrol|teal/i, label: 'azul-petróleo', en: 'petrol blue', native: 'turquoise', synonyms: ['petrol blue', 'teal', 'azul petróleo'] },
  { rx: /azul\s*(claro|c[eé]u)|sky blue|light blue/i, label: 'azul-claro', en: 'light blue', native: 'blue', synonyms: ['light blue', 'sky blue', 'azul claro'] },
  { rx: /turquesa|turquoise/i, label: 'turquesa', en: 'turquoise', native: 'turquoise', synonyms: ['turquoise', 'turquesa', 'teal'] },
  { rx: /verde[\s-]*(folha|vivo)|leaf green/i, label: 'verde-folha', en: 'leaf green', native: 'green', synonyms: ['leaf green', 'bright green', 'verde folha', 'verde-folha'] },
  { rx: /verde\s*oliva|olive/i, label: 'verde-oliva', en: 'olive green', native: 'green', synonyms: ['olive', 'olive green', 'verde oliva'] },
  { rx: /verde\s*esmeralda|emerald/i, label: 'verde-esmeralda', en: 'emerald green', native: 'green', synonyms: ['emerald', 'emerald green', 'verde esmeralda'] },
  { rx: /amarelo[\s-]*(vivo|brilhante)|bright yellow/i, label: 'amarelo-vivo', en: 'bright yellow', native: 'yellow', synonyms: ['bright yellow', 'yellow', 'amarelo vivo', 'amarelo-vivo'] },
  { rx: /mostarda|mustard/i, label: 'mostarda', en: 'mustard yellow', native: 'yellow', synonyms: ['mustard', 'mustard yellow', 'mostarda'] },
  { rx: /coral/i, label: 'coral', en: 'coral', native: 'orange', synonyms: ['coral'] },
  { rx: /terracota|terracotta/i, label: 'terracota', en: 'terracotta', native: 'orange', synonyms: ['terracotta', 'terracota'] },
  // Em couro e camurca, "laranja queimado" costuma ser descrito por catalogos
  // como rust, cognac, tan ou brown. A Edge Function ainda confirma a cor
  // diretamente nos pixels da peca antes de aceitar a fotografia.
  { rx: /laranja\s*queimad[oa]?|burnt\s*orange|rust|ferrugem/i, label: 'laranja-queimado', en: 'burnt orange', native: 'orange', synonyms: ['burnt orange', 'rust', 'orange', 'terracotta', 'cognac', 'tan', 'brown'] },
  { rx: /vinho|bord[oô]|burgundy/i, label: 'vinho', en: 'burgundy', native: 'red', synonyms: ['burgundy', 'wine red', 'vinho', 'bordô'] },
  { rx: /magenta/i, label: 'magenta', en: 'magenta', native: 'pink', synonyms: ['magenta'] },
  { rx: /lil[aá]s|lavanda|lavender/i, label: 'lavanda', en: 'lavender', native: 'violet', synonyms: ['lavender', 'lilac', 'lavanda', 'lilás'] },
  { rx: /off[ -]?white|marfim|ivory|creme/i, label: 'off-white', en: 'off white', native: 'white', synonyms: ['off white', 'ivory', 'cream', 'marfim'] },
  { rx: /caramelo|camel/i, label: 'caramelo', en: 'camel', native: 'brown', synonyms: ['camel', 'caramel', 'caramelo'] },
  { rx: /bege|nude|beige/i, label: 'bege', en: 'beige', native: 'brown', synonyms: ['beige', 'nude', 'bege'] },
  { rx: /preto|black/i, label: 'preto', en: 'black', native: 'black', synonyms: ['black', 'preto'] },
  { rx: /branco|white/i, label: 'branco', en: 'white', native: 'white', synonyms: ['white', 'branco'] },
  { rx: /cinza|gray|grey/i, label: 'cinza', en: 'gray', native: 'gray', synonyms: ['gray', 'grey', 'cinza'] },
  { rx: /marrom|brown|chocolate/i, label: 'marrom', en: 'brown', native: 'brown', synonyms: ['brown', 'chocolate', 'marrom'] },
  { rx: /vermelho|red/i, label: 'vermelho', en: 'red', native: 'red', synonyms: ['red', 'vermelho'] },
  { rx: /rosa|pink/i, label: 'rosa', en: 'pink', native: 'pink', synonyms: ['pink', 'rose', 'rosa'] },
  { rx: /roxo|violeta|purple|violet/i, label: 'violeta', en: 'violet', native: 'violet', synonyms: ['violet', 'purple', 'violeta'] },
  { rx: /laranja|orange/i, label: 'laranja', en: 'orange', native: 'orange', synonyms: ['orange', 'laranja'] },
  { rx: /amarelo|yellow/i, label: 'amarelo', en: 'yellow', native: 'yellow', synonyms: ['yellow', 'amarelo'] },
  { rx: /verde|green/i, label: 'verde', en: 'green', native: 'green', synonyms: ['green', 'verde'] },
  { rx: /azul|blue/i, label: 'azul', en: 'blue', native: 'blue', synonyms: ['blue', 'azul'] },
];

const FABRIC_RULES: Rule[] = [
  { rx: /algod[aã]o|cotton/i, label: 'algodão', en: 'cotton', synonyms: ['cotton', 'algodão'] },
  { rx: /linho|linen/i, label: 'linho', en: 'linen', synonyms: ['linen', 'linho'] },
  { rx: /jeans|denim/i, label: 'jeans', en: 'denim', synonyms: ['denim', 'jeans'] },
  { rx: /couro|leather/i, label: 'couro', en: 'leather', synonyms: ['leather', 'couro'] },
  { rx: /sarja|twill/i, label: 'sarja', en: 'twill', synonyms: ['twill', 'sarja'] },
  { rx: /modal/i, label: 'modal', en: 'modal jersey', synonyms: ['modal', 'modal jersey'] },
  { rx: /seda|silk/i, label: 'seda', en: 'silk', synonyms: ['silk', 'seda'] },
  { rx: /cashmere|caxemira/i, label: 'cashmere', en: 'cashmere', synonyms: ['cashmere', 'caxemira'] },
  { rx: /cetim|satin/i, label: 'cetim', en: 'satin', synonyms: ['satin', 'cetim'] },
  { rx: /tric[oô]|knit|malha/i, label: 'tricô', en: 'knit', synonyms: ['knit', 'knitted', 'tricô'] },
  { rx: /crepe/i, label: 'crepe', en: 'crepe', synonyms: ['crepe'] },
  // Limites explícitos: sem eles, "flat" e "claro" podiam conter "la" e
  // transformar couro/linho/etc. em lã.
  { rx: /\bwool\b|(?:^|[\s,;()])l[aã](?=$|[\s,;.()])/i, label: 'lã', en: 'wool', synonyms: ['wool', 'lã'] },
  { rx: /camur[cç]a|suede/i, label: 'camurça', en: 'suede', synonyms: ['suede', 'camurça'] },
  { rx: /veludo|velvet/i, label: 'veludo', en: 'velvet', synonyms: ['velvet', 'veludo'] },
];

const PIECE_RULES: Rule[] = [
  { rx: /mule|slingback/i, label: 'mule slingback', en: 'women mule slingback shoes', synonyms: ['mule', 'mules', 'slingback', 'shoe', 'shoes'] },
  { rx: /mocassim|loafer/i, label: 'mocassim', en: 'women loafers', synonyms: ['loafer', 'loafers', 'mocassim'] },
  { rx: /scarpin|pump/i, label: 'scarpin', en: 'women pump shoes', synonyms: ['pump', 'pumps', 'scarpin', 'heels'] },
  { rx: /sand[aá]lia|sandal/i, label: 'sandália', en: 'women sandals', synonyms: ['sandal', 'sandals', 'sandália'] },
  { rx: /t[eê]nis|sneaker/i, label: 'tênis', en: 'women sneakers', synonyms: ['sneaker', 'sneakers', 'tênis'] },
  { rx: /bota|boot/i, label: 'bota', en: 'women boots', synonyms: ['boot', 'boots', 'bota'] },
  { rx: /jaqueta\s*utilit[aá]ria|utility jacket/i, label: 'jaqueta utilitária', en: 'women utility jacket', synonyms: ['utility jacket', 'field jacket', 'jacket', 'jaqueta utilitária'] },
  { rx: /jaqueta|jacket/i, label: 'jaqueta', en: 'women jacket', synonyms: ['jacket', 'jaqueta'] },
  { rx: /blazer/i, label: 'blazer', en: 'women blazer', synonyms: ['blazer'] },
  { rx: /capa|cape/i, label: 'capa', en: 'women cape jacket', synonyms: ['cape', 'coat', 'jacket', 'outerwear'] },
  { rx: /casaco|coat/i, label: 'casaco', en: 'women coat', synonyms: ['coat', 'casaco'] },
  { rx: /saia|skirt/i, label: 'saia', en: 'women skirt', synonyms: ['skirt', 'saia'] },
  { rx: /jeans\s*mom|mom jeans/i, label: 'jeans mom', en: 'women high waist mom jeans', synonyms: ['mom jeans', 'jeans', 'denim pants', 'pants', 'trousers'] },
  { rx: /jeans|denim/i, label: 'jeans', en: 'women jeans', synonyms: ['jeans', 'denim pants'] },
  { rx: /\bcal[cç]a\b|pantalona|trousers|pants/i, label: 'calça', en: 'women trousers', synonyms: ['trousers', 'pants', 'calça'] },
  { rx: /macac[aã]o|jumpsuit/i, label: 'macacão', en: 'women jumpsuit', synonyms: ['jumpsuit', 'macacão'] },
  { rx: /vestido|dress/i, label: 'vestido', en: 'women dress', synonyms: ['dress', 'vestido'] },
  { rx: /regata|tank\s*top/i, label: 'regata', en: 'women sleeveless tank top', synonyms: ['tank top', 'sleeveless top', 'regata'] },
  { rx: /camisa|shirt/i, label: 'camisa', en: 'women button up collared shirt', synonyms: ['button up shirt', 'button down shirt', 'collared shirt', 'blouse'] },
  { rx: /blusa|top|camiseta|t-shirt/i, label: 'blusa', en: 'women blouse', synonyms: ['blouse', 'sleeveless top'] },
  { rx: /bolsa|clutch|bag|carteira/i, label: 'bolsa', en: 'women handbag', synonyms: ['handbag', 'bag', 'purse', 'bolsa', 'clutch'] },
  { rx: /cinto|len[cç]o|colar|brinco|[oó]culos|accessor/i, label: 'acessório', en: 'women fashion accessory', synonyms: ['accessory', 'jewelry', 'belt', 'scarf', 'acessório'] },
];

const STYLE_RULES: Rule[] = [
  { rx: /elegant|elegante/i, label: 'elegante', en: 'elegant', synonyms: ['elegant', 'elegante'] },
  { rx: /natural|minimal/i, label: 'natural', en: 'natural minimalist', synonyms: ['natural', 'minimalist'] },
  { rx: /cl[aá]ssic|classic/i, label: 'clássico', en: 'classic', synonyms: ['classic', 'clássico'] },
  { rx: /criativ|creative|artistic/i, label: 'criativo', en: 'creative', synonyms: ['creative', 'artistic'] },
  { rx: /rom[aâ]ntic|romantic/i, label: 'romântico', en: 'romantic', synonyms: ['romantic', 'romântico'] },
  { rx: /dram[aá]tic|dramatic/i, label: 'dramático', en: 'dramatic', synonyms: ['dramatic', 'dramático'] },
  { rx: /contempor|modern/i, label: 'contemporâneo', en: 'contemporary', synonyms: ['contemporary', 'modern'] },
  { rx: /sensual/i, label: 'sensual', en: 'refined sensual', synonyms: ['sensual'] },
];

const SECTION_QUERY: Record<string, { query: string; terms: string[] }> = {
  estilo: { query: 'women personal style outfit editorial photography', terms: ['woman', 'women', 'outfit', 'fashion'] },
  movimento: { query: 'women flowing fabric outfit editorial photography', terms: ['woman', 'women', 'fabric', 'outfit'] },
  cores: { query: 'women personal color palette fashion editorial photography', terms: ['woman', 'women', 'fashion', 'color'] },
  paleta: { query: 'real fashion fabric color swatches flat lay photography', terms: ['fabric', 'textile', 'swatch', 'fashion'] },
  modelagens: { query: 'women tailored garment silhouette editorial photography', terms: ['woman', 'women', 'tailored', 'garment'] },
  corpo: { query: 'women fashion silhouette proportions editorial photography', terms: ['woman', 'women', 'silhouette', 'fashion'] },
  essenciais: { query: 'women essential wardrobe real clothes flat lay photography', terms: ['clothes', 'wardrobe', 'fashion', 'garment'] },
  capsula: { query: 'women capsule wardrobe real clothes flat lay photography', terms: ['clothes', 'wardrobe', 'fashion', 'garment'] },
  alfaiataria: { query: 'women tailored clothing detail editorial photography', terms: ['tailored', 'tailoring', 'clothing', 'fashion'] },
  tecidos_materiais: { query: 'real fashion fabric texture textile close up photography', terms: ['fabric', 'textile', 'material'] },
  coloracao_avancada: { query: 'women personal color analysis fabric draping photography', terms: ['woman', 'women', 'fabric', 'color'] },
  inspiracoes: { query: 'women fashion inspiration editorial photography', terms: ['woman', 'women', 'fashion', 'outfit'] },
  acessorios: { query: 'women real fashion accessories product photography', terms: ['accessory', 'accessories', 'fashion'] },
  beleza: { query: 'women beauty styling editorial photography', terms: ['woman', 'women', 'beauty'] },
  ocasioes: { query: 'women occasion outfit editorial photography', terms: ['woman', 'women', 'outfit'] },
  viagens: { query: 'women travel capsule wardrobe real clothes photography', terms: ['woman', 'women', 'travel', 'clothes', 'wardrobe'] },
  sazonalidade: { query: 'women seasonal wardrobe real clothes photography', terms: ['woman', 'women', 'clothes', 'wardrobe'] },
  investimento: { query: 'timeless quality women fashion piece product photography', terms: ['fashion', 'clothing', 'garment', 'accessory'] },
  resumo: { query: 'women personal style wardrobe editorial photography', terms: ['woman', 'women', 'wardrobe', 'fashion'] },
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/#\d+\s*$/, '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown): string {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function matchRule(rules: Rule[], ...values: Array<string | null | undefined>): Rule | null {
  const text = values.map(clean).filter(Boolean).join(' ');
  let selected: { rule: Rule; index: number } | null = null;
  for (const rule of rules) {
    const match = text.match(rule.rx);
    if (!match || typeof match.index !== 'number') continue;
    if (!selected || match.index < selected.index) selected = { rule, index: match.index };
  }
  return selected?.rule || null;
}

function fallbackPiece(category?: string): Rule {
  const value = normalize(category);
  if (/calcado|footwear|shoe/.test(value)) return { rx: /./, label: 'calçado', en: 'women shoes', synonyms: ['shoe', 'shoes', 'footwear'], category: 'footwear' };
  if (/bottom|pants|trouser|calca|saia/.test(value)) return { rx: /./, label: 'calça', en: 'women trousers', synonyms: ['pants', 'trousers', 'skirt'], category: 'bottoms' };
  if (/terceira|tercas|outerwear|casaco/.test(value)) return { rx: /./, label: 'terceira peça', en: 'women jacket', synonyms: ['jacket', 'blazer', 'outerwear'], category: 'outerwear' };
  if (/bolsa|bag/.test(value)) return { rx: /./, label: 'bolsa', en: 'women handbag', synonyms: ['handbag', 'bag', 'purse'], category: 'bags' };
  if (/acessor/.test(value)) return { rx: /./, label: 'acessório', en: 'women fashion accessory', synonyms: ['accessory', 'jewelry', 'belt', 'scarf'], category: 'accessories' };
  if (/vestido|dress/.test(value)) return { rx: /./, label: 'vestido', en: 'women dress', synonyms: ['dress'], category: 'dress' };
  return { rx: /./, label: 'blusa', en: 'women blouse top', synonyms: ['blouse', 'top', 'shirt'], category: 'tops' };
}

function canonicalCategory(category: string | undefined, piece: Rule, mode: DiagnosticImageMode): string {
  if (mode === 'editorial') return normalize(category) || 'editorial';
  if (piece.category) return piece.category;
  const value = normalize(`${category || ''} ${piece.label}`);
  if (/calcado|footwear|shoe|mule|slingback|mocassim|loafer|scarpin|sandalia|tenis|bota/.test(value)) return 'footwear';
  if (/bottom|pants|trouser|calca|saia|skirt|jeans/.test(value)) return 'bottoms';
  if (/terceira|tercas|outerwear|jaqueta|blazer|casaco|capa|coat|jacket/.test(value)) return 'outerwear';
  if (/vestido|dress|macacao|jumpsuit/.test(value)) return 'dress';
  if (/bolsa|bag|clutch/.test(value)) return 'bags';
  if (/acessor|jewel|cinto|lenco/.test(value)) return 'accessories';
  return 'tops';
}

function isExcludedColor(rule: Rule | null, excludedColors: string[] | undefined): boolean {
  if (!rule || !excludedColors?.length) return false;
  const blockedTokens = normalize(excludedColors.join(' ')).split(/\s+/).filter((token) => token.length > 2);
  const ruleTokens = new Set(normalize([rule.label, rule.en, ...rule.synonyms].join(' ')).split(/\s+/).filter(Boolean));
  return blockedTokens.some((token) => ruleTokens.has(token));
}

export function buildDiagnosticImageContract(input: DiagnosticImageContractInput): DiagnosticImageContract {
  const mode = input.mode || (input.pieceName || input.category ? 'product' : 'editorial');
  const normalizedSection = normalize(input.section);
  // A categoria textual (ex.: "calcados") não entra no classificador de
  // nome. Antes, "calcados" era lido como "calca" e um mule buscava calças.
  const piece = matchRule(PIECE_RULES, input.pieceName) || fallbackPiece(input.category);
  const detectedExplicitColor = matchRule(COLOR_RULES, input.pieceName);
  const explicitColor = isExcludedColor(detectedExplicitColor, input.excludedColors) ? null : detectedExplicitColor;
  const profileColor = explicitColor || matchRule(COLOR_RULES, input.color);
  const explicitFabric = matchRule(FABRIC_RULES, input.pieceName);
  const profileFabric = explicitFabric || matchRule(FABRIC_RULES, input.fabric);
  const style = matchRule(STYLE_RULES, input.style);
  const section = SECTION_QUERY[normalize(input.section)] || { query: 'women fashion editorial photography', terms: ['woman', 'women', 'fashion'] };
  const colorText = profileColor?.en || clean(input.color) || '';
  const fabricText = profileFabric?.en || clean(input.fabric) || '';
  const styleText = style?.en || clean(input.style) || 'personal style';
  const categoryKey = canonicalCategory(input.category, piece, mode);
  const strictProduct = `${colorText} ${piece.en} ${fabricText} ${styleText} real clothing product photo isolated plain background`;
  const query = mode === 'product'
    ? strictProduct
    : `${styleText} ${colorText} ${fabricText} ${section.query}`;
  const alternateQueries = mode === 'product'
    ? [
        strictProduct,
        `${colorText} ${piece.en} ${fabricText} real product photography`,
        `${piece.en} ${colorText} womenswear retailer product photo`,
      ]
    : [
        query,
        `${section.query} ${styleText} ${colorText}`,
        `${colorText} ${fabricText} ${section.query}`,
      ];
  // A mesma peça reaparece em Peças-Chave, Cápsula e Looks. Ela deve reutilizar
  // a mesma fotografia validada nesses pontos; somente editoriais precisam de
  // identidades distintas por seção/tile. Isso reduz chamadas e evita que o
  // mesmo produto mude de aparência dentro do próprio diagnóstico.
  const identitySource = mode === 'product'
    ? [
        input.diagnosisId || 'preview', 'product', piece.label, categoryKey,
        profileColor?.label || normalize(colorText), profileFabric?.label || normalize(fabricText),
      ].join('|')
    : [
        input.diagnosisId || 'preview', input.section, input.variant || 'primary', input.tileIndex ?? 0,
        input.variantIndex ?? 0, colorText, fabricText, styleText,
      ].join('|');
  return {
    identity: `real-v26-${stableHash(identitySource)}-${normalize(mode === 'product' ? piece.label : input.section).slice(0, 40)}`,
    query: query.replace(/\s+/g, ' ').trim().slice(0, 120),
    alternateQueries: Array.from(new Set(alternateQueries.map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 120)))),
    requiredTerms: mode === 'product' ? piece.synonyms : section.terms,
    requiredColorTerms: explicitColor?.synonyms || profileColor?.synonyms || [],
    requiredFabricTerms: explicitFabric?.synonyms || profileFabric?.synonyms || [],
    mode,
    nativeColor: profileColor?.native || null,
    normalizedColor: profileColor?.label || colorText,
    normalizedFabric: profileFabric?.label || fabricText,
    normalizedStyle: style?.label || styleText,
    normalizedCategory: categoryKey,
  };
}

export function isVerifiedRealPhotoResult(result: {
  imageUrl?: string | null;
  semanticValidated?: boolean;
  semanticScore?: number;
  photoVerified?: boolean;
  contentType?: string | null;
  colorPixelValidated?: boolean;
} | null | undefined, mode: DiagnosticImageMode): boolean {
  if (!result?.imageUrl || !/^https:\/\//i.test(result.imageUrl)) return false;
  if (result.semanticValidated !== true || result.photoVerified !== true) return false;
  if (result.colorPixelValidated !== true) return false;
  if (result.contentType && !/^image\/(jpeg|jpg|webp|png)$/i.test(result.contentType)) return false;
  return Number(result.semanticScore || 0) >= (mode === 'product' ? 75 : 60);
}
