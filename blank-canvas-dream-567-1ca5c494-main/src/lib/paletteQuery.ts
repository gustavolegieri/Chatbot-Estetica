// Paleta + exclusões — extraídas do QUESTIONÁRIO da cliente e usadas para
// (1) enriquecer as queries positivas dos provedores de imagem
// (2) alimentar o validador de IA (auditoria multimodal) com uma lista de
//     EXCLUSÕES OBRIGATÓRIAS que reprovam automaticamente qualquer imagem
//     candidata que contenha cor/textura da lista.
//
// A query enviada aos provedores é SEMPRE POSITIVA (buscadores de imagem
// ignoram negação). As exclusões viram (a) sinal para escolher termos
// positivos mais específicos e (b) filtro server-side de alt/title e IA.

export type PaletaChoice = 'paleta_neutra' | 'paleta_fria' | 'paleta_rose' | 'paleta_vibrante';

export const PALETA_EN: Record<PaletaChoice, { en: string; pt: string; anchors: string[] }> = {
  paleta_neutra:   { en: 'warm neutral camel tones',    pt: 'neutros quentes camelo',   anchors: ['camel', 'beige', 'off-white', 'brown', 'gold'] },
  paleta_fria:     { en: 'deep cool navy tones',        pt: 'frios profundos marinho',  anchors: ['navy', 'charcoal', 'black', 'crisp white', 'grey'] },
  paleta_rose:     { en: 'soft rose blush terracotta tones', pt: 'rosados poéticos terracota', anchors: ['dusty rose', 'nude', 'blush', 'terracotta', 'mauve'] },
  paleta_vibrante: { en: 'vibrant jewel tones',         pt: 'cores vibrantes joia',     anchors: ['burgundy red', 'emerald green', 'cobalt blue', 'saffron', 'jewel tone'] },
};

// Famílias de exclusão reconhecidas por palavras-chave no texto livre
// "Cores que você definitivamente evita" + reforços do bloco 5.
export interface ExclusionSet {
  /** Lista humana em PT-BR usada no prompt do validador de IA. */
  human: string[];
  /** Tokens que o pipeline de query deve EVITAR ao montar a busca positiva. */
  avoidTokensEN: Set<string>;
  /** Termos exatos para filtrar candidatos por alt/title nos provedores. */
  excludeTerms: string[];
}

const COLOR_NAMES_PT_TO_EN: Array<[RegExp, string, string]> = [
  // regex → (human PT, token EN)
  [/\bamarel\w*\s+(neon|fluor\w*)/i, 'amarelo neon',      'yellow neon'],
  [/\blaranja\s+(vibrante|neon|fluor\w*)?/i, 'laranja vibrante', 'orange'],
  [/\bverde\s+neon\b/i,       'verde neon',       'neon green'],
  [/\bverde\s+lim[aã]o\b/i,   'verde limão',      'lime'],
  [/\brosa\s+chiclete\b/i,    'rosa chiclete',    'hot pink'],
  [/\bpink\b/i,               'pink',             'hot pink'],
  [/\bfucsia|f[uú]csia\b/i,   'fúcsia',           'fuchsia'],
  [/\bvermelh\w*\b/i,         'vermelho',         'red'],
  [/\bamarel\w*\b/i,          'amarelo',          'yellow'],
  [/\blaranj\w*\b/i,          'laranja',          'orange'],
  [/\bmarrom\b/i,             'marrom',           'brown'],
  [/\bp[uú]rpur\w*|roxo\b/i,  'roxo',             'purple'],
  [/\bdourad\w*|gold\b/i,     'dourado',          'gold'],
  [/\bprateado|silver\b/i,    'prateado',         'silver'],
];

/**
 * Analisa o questionário e devolve a lista COMPLETA de exclusões.
 * - "Cores que você definitivamente evita" (texto livre) — parsing por palavra
 *   chave. Reconhece: pastel, neon, escuro, vibrante, claro/infantil, e cores
 *   nomeadas diretamente (amarelo, laranja, verde neon, etc).
 * - "Quais NÃO deseja transmitir" (bloco 5) — se contém Infantilidade/
 *   Desorganização, reforça exclusão de pastel e cores muito claras/infantis.
 * - "Tecidos evitados" (bloco 9) — tule, renda, poliéster brilhante, etc.
 */
export function buildExclusionsFromQuestionnaire(
  q: Record<string, unknown> | null | undefined,
): ExclusionSet {
  const human = new Set<string>();
  const avoid = new Set<string>();
  const terms = new Set<string>();

  const coresEvitaTxt = String((q as any)?.coresQueEvita || '').toLowerCase();
  const coresEvitaArr: string[] = Array.isArray((q as any)?.coresEvitar) ? (q as any).coresEvitar : [];
  const palavrasEvitar: string[] = Array.isArray((q as any)?.palavrasEvitar) ? (q as any).palavrasEvitar : [];
  const tecidosEvitar: string[] = Array.isArray((q as any)?.tecidosEvitar) ? (q as any).tecidosEvitar : [];

  const raw = [coresEvitaTxt, ...coresEvitaArr.map((c) => String(c).toLowerCase())].join(' ');

  const addPastel = () => {
    human.add('tons pastéis (rosa bebê, lilás claro, azul bebê, menta claro, amarelo manteiga)');
    ['pastel', 'baby pink', 'baby blue', 'mint', 'light lavender', 'butter yellow', 'soft pastel'].forEach((t) => { avoid.add(t); terms.add(t); });
  };
  const addNeon = () => {
    human.add('cores neon/fluorescentes');
    ['neon', 'fluorescent', 'hot pink', 'lime', 'neon green', 'neon yellow'].forEach((t) => { avoid.add(t); terms.add(t); });
  };
  const addVibrantes = () => {
    human.add('cores muito saturadas/vibrantes');
    ['vibrant', 'saturated', 'jewel', 'bright red', 'bright orange'].forEach((t) => avoid.add(t));
    ['neon', 'fluorescent', 'vibrant saturated'].forEach((t) => terms.add(t));
  };
  const addEscuros = () => {
    human.add('paleta totalmente escura (só preto/carvão)');
    ['all black', 'gothic'].forEach((t) => terms.add(t));
  };

  if (/pastel|pastéis|pasteis|beb[eê]|manteiga|lil[aá]s claro|menta claro/.test(raw)) addPastel();
  if (/neon|fluor/.test(raw)) addNeon();
  if (/vibrante|saturad/.test(raw)) addVibrantes();
  if (/escur\w+/.test(raw)) addEscuros();

  // Cores nomeadas diretamente
  for (const [rx, humanPt, en] of COLOR_NAMES_PT_TO_EN) {
    if (rx.test(raw)) {
      human.add(`cor específica evitada: ${humanPt}`);
      avoid.add(en); terms.add(en);
    }
  }

  // Bloco 5 — reforço via mensagens que a cliente não quer transmitir
  const evita = palavrasEvitar.map((p) => p.toLowerCase()).join(' ');
  if (/infantilidade|desorganiza|timidez/.test(evita)) {
    if (!human.has('tons pastéis (rosa bebê, lilás claro, azul bebê, menta claro, amarelo manteiga)')) addPastel();
    human.add('estampas infantis/lúdicas');
    ['cartoon', 'kids print', 'childish print', 'ditsy floral'].forEach((t) => terms.add(t));
  }

  // Tecidos evitados
  for (const t of tecidosEvitar) {
    const s = String(t).toLowerCase();
    if (/poli[eé]ster brilhante/.test(s)) { human.add('poliéster brilhante'); ['shiny polyester', 'glossy synthetic'].forEach((x) => terms.add(x)); }
    if (/tule/.test(s))                   { human.add('tule');                ['tulle'].forEach((x) => terms.add(x)); }
    if (/renda/.test(s))                  { human.add('renda');               ['lace'].forEach((x) => terms.add(x)); }
    if (/veludo/.test(s))                 { human.add('veludo');              ['velvet'].forEach((x) => terms.add(x)); }
    if (/cetim/.test(s))                  { human.add('cetim');               ['satin'].forEach((x) => terms.add(x)); }
    if (/couro\s+sint[eé]tico/.test(s))   { human.add('couro sintético brilhante'); ['patent leather', 'shiny faux leather'].forEach((x) => terms.add(x)); }
  }

  return { human: Array.from(human), avoidTokensEN: avoid, excludeTerms: Array.from(terms) };
}

/**
 * Devolve tokens POSITIVOS em EN para a query da imagem, combinando:
 *  a) "Cores que te fazem brilhar" (texto livre)  — 1-2 primeiros nomes
 *  b) Escolha do bloco 4 "Qual paleta te atrai mais" (chip) — âncora rica
 *  c) Cor-âncora inferida (opcional, passada externamente) — reforço
 * Já evita usar termos que colidam com as exclusões (ex: se exclui
 * "pastel", não empurra "soft pink" ou "blush" mesmo se a paleta escolhida
 * for `paleta_rose` — troca por âncoras mais saturadas: "deep rose",
 * "burgundy rose", "terracotta rose").
 */
export function buildPalettePositiveEN(
  q: Record<string, unknown> | null | undefined,
  fallbackAnchorEN?: string | null,
): { anchorEN: string; tokensEN: string[]; humanShort: string } {
  const exclusions = buildExclusionsFromQuestionnaire(q);
  const avoid = exclusions.avoidTokensEN;
  const paleta = String((q as any)?.psicometrico?.paleta || '') as PaletaChoice | '';
  const chosen = PALETA_EN[paleta as PaletaChoice];

  // Anchor primário (rico, ~4 palavras) — trocado se cliente excluir pastel/soft
  let anchorEN = chosen?.en || (fallbackAnchorEN || 'refined neutral tones');
  let humanShort = chosen?.pt || 'paleta refinada';

  // Se paleta_rose + exclui pastel, força versão mais saturada
  if (paleta === 'paleta_rose' && (avoid.has('pastel') || avoid.has('baby pink'))) {
    anchorEN = 'deep rose terracotta burgundy tones';
    humanShort = 'rosa profundo terracota';
  }
  // Se paleta_vibrante + exclui vibrantes, cai para joia mais discreta
  if (paleta === 'paleta_vibrante' && (avoid.has('vibrant') || avoid.has('neon'))) {
    anchorEN = 'deep jewel emerald burgundy tones';
    humanShort = 'joia profundo';
  }
  // Se paleta_neutra + exclui marrom (raro), troca por off-white/gold
  if (paleta === 'paleta_neutra' && avoid.has('brown')) {
    anchorEN = 'off-white camel cream tones';
    humanShort = 'neutros claros creme';
  }

  const tokensEN: string[] = [];
  if (chosen) tokensEN.push(...chosen.anchors);
  // Cores adoradas (texto livre) — 1º nome reconhecido é enviado como positivo
  const ama = String((q as any)?.coresQueAma || '').toLowerCase();
  const LOVED_MAP: Array<[RegExp, string]> = [
    [/burgundy|bord[oô]|vinho/, 'burgundy'],
    [/off.?white|branco quebrado/, 'off-white'],
    [/verde.?musgo/, 'moss green'],
    [/camel|camelo/, 'camel'],
    [/navy|marinho/, 'navy'],
    [/preto\b/, 'black'],
    [/oliva/, 'olive'],
    [/terracot/, 'terracotta'],
    [/creme|ecru/, 'ecru'],
    [/cinza chumbo|charcoal/, 'charcoal'],
    [/rosa/, 'rose'],
    [/lil[aá]s|lavanda/, 'lavender'],
  ];
  for (const [rx, en] of LOVED_MAP) {
    if (rx.test(ama) && !avoid.has(en)) { tokensEN.push(en); break; }
  }

  // Remove tokens que caiam na lista de exclusão
  const filtered = tokensEN.filter((t) => !avoid.has(t));
  return { anchorEN, tokensEN: filtered.slice(0, 3), humanShort };
}
