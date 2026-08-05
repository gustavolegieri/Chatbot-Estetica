// Teste manual runnable: `bunx tsx src/lib/queryFragments.test.ts`
// Não usa framework (vitest não está no projeto). Sai com código != 0 se
// qualquer asserção falhar.

import {
  buildQuery,
  allCombinations,
  ESTILO_FRAGMENT,
  PALETA_FRAGMENT,
  resolveNativeColor,
  GENERIC_FALLBACK_POOL,
  SUFIXO_FIXO,
  SUFIXO_SECTION,
} from './queryFragments';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) { failed += 1; console.error('FAIL:', msg); }
}

// 1. 24 combinações
assert(allCombinations().length === 24, 'esperado 24 combinações');
assert(Object.keys(ESTILO_FRAGMENT).length === 6, 'esperado 6 estilos');
assert(Object.keys(PALETA_FRAGMENT).length === 4, 'esperado 4 paletas');

// 2. Limite rígido de 10 palavras
for (const { query, estilo, paleta } of allCombinations()) {
  const words = query.split(/\s+/).filter(Boolean).length;
  assert(words <= 10, `${estilo}/${paleta} tem ${words} palavras: "${query}"`);
}

// 3. Formato fixo da query base (2 frags + sufixo "fashion woman outfit")
for (const { estilo, paleta, query } of allCombinations()) {
  const expected = `${ESTILO_FRAGMENT[estilo]} ${PALETA_FRAGMENT[paleta]} ${SUFIXO_FIXO}`;
  assert(query === expected, `${estilo}/${paleta}: "${query}" ≠ "${expected}"`);
}

// 4. Determinismo — âncora de silhueta em cada estilo.
assert(
  buildQuery('classico', 'rosados_poeticos') === 'tailored classic blazer soft rose fashion woman outfit',
  `buildQuery clássico+rose incorreto → "${buildQuery('classico','rosados_poeticos')}"`,
);

// 5. Coloração REAL → cor nativa (independente do estilo)
assert(resolveNativeColor(null, { estacao: 'Primavera', subtipo: 'Quente' }) === 'orange',
  'Primavera Quente → orange');
assert(resolveNativeColor(null, { estacao: 'Outono', subtipo: 'Profundo' }) === 'brown',
  'Outono Profundo → brown');
assert(resolveNativeColor(null, { estacao: 'Inverno', subtipo: 'Frio' }) === 'blue',
  'Inverno Frio → blue');
assert(resolveNativeColor(null, { estacao: 'Verão', subtipo: 'Suave' }) === 'blue',
  'Verão Suave → blue');
assert(resolveNativeColor(null, { coloracao_pessoal: 'Primavera Clara' }) === 'yellow',
  'Primavera Clara → yellow');
assert(resolveNativeColor({ tomDePele: 'Claro', estiloPersonalidade: 'Clássico e atemporal' } as any,
  { estacao: 'Primavera', subtipo: 'Quente' }) === 'orange',
  'Estilo clássico + Primavera Quente → orange (não blue)');

// 6. Pool de fallback
assert(GENERIC_FALLBACK_POOL.length >= 8 && GENERIC_FALLBACK_POOL.length <= 10,
  `pool deve ter 8-10 fotos, tem ${GENERIC_FALLBACK_POOL.length}`);
for (const url of GENERIC_FALLBACK_POOL) {
  assert(/^https:\/\//.test(url), `URL de fallback inválida: ${url}`);
}

// 7. Queries de seção — 3 fragmentos + sufixo curto.
import {
  buildSectionQuery,
  buildQueryFromMany,
  resolveOcasiao,
  resolveRotina,
  resolveTecido,
  resolveEstampa,
  TECIDO_FRAGMENT,
  ESTAMPA_FRAGMENT,
  ROTINA_FRAGMENT,
  OCASIAO_FRAGMENT,
  type SectionQueryId,
  type ProfileFragments,
} from './queryFragments';

const SECTIONS: SectionQueryId[] = [
  'estilo','movimento','cores','paleta','modelagens','essenciais','capsula','alfaiataria',
  'tecidos_materiais','coloracao_avancada','moodboard','inspiracoes',
];

const estilos = Object.keys(ESTILO_FRAGMENT) as Array<keyof typeof ESTILO_FRAGMENT>;
const paletas = Object.keys(PALETA_FRAGMENT) as Array<keyof typeof PALETA_FRAGMENT>;
const tecidos = Object.keys(TECIDO_FRAGMENT) as Array<keyof typeof TECIDO_FRAGMENT>;
const estampas = Object.keys(ESTAMPA_FRAGMENT) as Array<keyof typeof ESTAMPA_FRAGMENT>;
const rotinas = Object.keys(ROTINA_FRAGMENT) as Array<keyof typeof ROTINA_FRAGMENT>;
const ocasioes = Object.keys(OCASIAO_FRAGMENT) as Array<keyof typeof OCASIAO_FRAGMENT>;

function rand<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

// Seções com intenção visual própria (swatch/manequim/acessório) não usam o
// sufixo "womenswear" — são checadas apenas por limite de palavras + âncora.
const CUSTOM_INTENT: Partial<Record<SectionQueryId, RegExp>> = {
  cores:            /woman fabric$/,
  paleta:           /woman color palette$/,
  modelagens:       /outfit elegant woman style$/,
  essenciais:       /woman handbag$/,
  alfaiataria:      /woman tailoring fabric$/,
  tecidos_materiais: /woman fabric texture$/,
};

for (let i = 0; i < 60; i += 1) {
  const p: ProfileFragments = {
    estilo:  rand(estilos, i * 7 + 1),
    paleta:  rand(paletas, i * 11 + 3),
    tecido:  rand(tecidos, i * 13 + 5),
    estampa: rand(estampas, i * 17 + 2),
    rotina:  rand(rotinas, i * 19 + 4),
    ocasiao: rand(ocasioes, i * 23 + 6),
  };
  for (const section of SECTIONS) {
    const q = buildSectionQuery(section, p);
    const words = q.split(/\s+/).filter(Boolean).length;
    assert(words <= 10, `${section} passou de 10 palavras (${words}): "${q}"`);
    const custom = CUSTOM_INTENT[section];
    if (custom) {
      assert(custom.test(q), `${section}: intenção visual incorreta em "${q}"`);
    } else {
      assert(q.endsWith(SUFIXO_SECTION), `${section}: sufixo curto faltando em "${q}"`);
    }
  }
}

// Regras específicas por seção com um perfil âncora.
const sampleProfile: ProfileFragments = {
  estilo: 'classico', paleta: 'neutros_quentes', tecido: 'seda',
  estampa: 'floral_pequeno', rotina: 'escritorio', ocasiao: 'formal',
};

// estilo → estilo + sufixo "elegant woman style".
assert(
  buildSectionQuery('estilo', sampleProfile) === 'tailored classic elegant woman style',
  `estilo: "${buildSectionQuery('estilo', sampleProfile)}"`,
);

// alfaiataria → tecido + woman + tailoring fabric.
assert(
  /woman tailoring fabric$/.test(buildSectionQuery('alfaiataria', sampleProfile)),
  `alfaiataria deve terminar em "woman tailoring fabric": "${buildSectionQuery('alfaiataria', sampleProfile)}"`,
);

// cores → paleta + woman + fabric (não usa tecido do usuário).
assert(
  buildSectionQuery('cores', sampleProfile) === 'warm neutral woman fabric',
  `cores: "${buildSectionQuery('cores', sampleProfile)}"`,
);

// essenciais → acessório com estilo + woman + handbag.
assert(
  /woman handbag$/.test(buildSectionQuery('essenciais', sampleProfile)),
  `essenciais deve terminar em "woman handbag"`,
);

// Duas seções distintas com o mesmo perfil devem, na maioria dos casos, gerar
// queries diferentes (variação visual entre tiles do dossiê).
const qA = buildSectionQuery('estilo', sampleProfile);
const qB = buildSectionQuery('essenciais', sampleProfile);
assert(qA !== qB, 'estilo e essenciais devem gerar queries distintas');

// buildQueryFromMany limita a 10 palavras totais (7 + sufixo de 3 palavras).
const longQ = buildQueryFromMany(['a b c', 'd e f', 'g h i', 'j k l']);
assert(
  longQ.split(/\s+/).length <= 10,
  `buildQueryFromMany deve limitar a 10 palavras: "${longQ}"`,
);

// Resolvers: prioridade de ocasião.
assert(resolveOcasiao({ ocasioesEspeciaisAno: ['Jantares importantes','Casamentos'] }) === 'formal',
  'formal ganha de encontro');
assert(resolveOcasiao({ ocasioesEspeciaisAno: ['Palestras'] }) === 'corporativo', 'corporativo');
assert(resolveOcasiao({ ocasioesEspeciaisAno: [] }) === 'everyday', 'default everyday');
assert(resolveOcasiao({}) === 'everyday', 'sem chave → everyday');

assert(resolveRotina({ rotina: 'Home office / remoto' }) === 'home_office', 'rotina home_office');
assert(resolveRotina({}) === 'hibrido', 'rotina default hibrido');

assert(resolveTecido({ tecidosPreferidos: ['Seda','Linho'] }) === 'seda', 'tecido primeiro');
assert(resolveTecido({ tecidosPreferidos: [] }) === null, 'tecido null quando vazio');

assert(resolveEstampa({ estampasPreferidas: ['Poá'] }) === 'poa', 'estampa poa');
assert(resolveEstampa({}) === 'liso', 'estampa default liso');

if (failed > 0) {
  console.error(`\n${failed} asserção(ões) falharam.`);
  (globalThis as any).process?.exit?.(1);
} else {
  console.log('✓ Todos os testes de queryFragments passaram.');
  console.log('\n24 combinações estilo × paleta (query base):');
  for (const { estilo, paleta, query } of allCombinations()) {
    const words = query.split(/\s+/).length;
    console.log(`  [${words}w] ${estilo.padEnd(10)} × ${paleta.padEnd(18)} → "${query}"`);
  }
}
