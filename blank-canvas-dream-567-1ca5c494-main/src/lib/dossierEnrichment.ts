// Small, self-contained helpers to expand a few specific dossier blocks that
// otherwise render a single generic sentence. Everything below only *appends*
// extra sentences/items derived from the user's own questionnaire and
// diagnosis — never replaces existing AI output.

type Dict = Record<string, unknown>;

const asArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
};
const s = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : '')).filter(Boolean).join(', ');
  return '';
};
const lc = (v: string) => v.toLowerCase();
const join = (arr: string[], max = 3) => arr.slice(0, max).join(', ');

/** 2-3 extra sentences tying "Seu Perfil de Imagem" to real questionnaire answers. */
export function profileEnrichmentSentences(q: Dict | null | undefined): string {
  if (!q) return '';
  const objetivo = join(asArr((q as any).objetivosImagem));
  const palavras = join(asArr((q as any).palavrasTransmitir));
  const percep = join(asArr((q as any).percepcaoAtual));
  const lembrada = s((q as any).comoQuerSerLembrada);
  const bits: string[] = [];
  if (objetivo) bits.push(`Esse perfil se ancora no seu objetivo declarado de ${lc(objetivo)}, o que dá direção prática às escolhas do dia a dia.`);
  if (palavras) bits.push(`Ele traduz, em roupa, as palavras que você quer transmitir — ${lc(palavras)} — sem depender de esforço visível.`);
  else if (lembrada) bits.push(`Ele traduz a forma como você quer ser lembrada: ${lc(lembrada)}.`);
  if (percep) bits.push(`E fecha o gap entre a percepção atual (${lc(percep)}) e a leitura de autoridade que você pretende consolidar.`);
  return bits.slice(0, 3).join(' ');
}

/** 2-3 extra sentences citing algo concreto do diagnóstico para "Seu potencial visual". */
export function potentialEnrichmentSentences(d: Dict | null | undefined): string {
  if (!d) return '';
  const mp = (d.master_profile as Dict | undefined) ?? {};
  const biotipo = s((d as any).biotipo) || s(mp.biotipo);
  const estacao = s((d as any).estacao_coloracao) || s(mp.estacao_coloracao) || s(mp.coloracao);
  const estilo = s(mp.estilo_predominante) || s((d as any).assinatura);
  const bits: string[] = [];
  if (biotipo) bits.push(`Seu biotipo ${lc(biotipo)} entrega naturalmente linhas que valorizam silhuetas alongadas e cortes limpos.`);
  if (estacao) bits.push(`A coloração ${lc(estacao)} amplia o alcance da sua paleta e sustenta contrastes intencionais junto ao rosto.`);
  if (estilo) bits.push(`E o eixo ${lc(estilo)} organiza esses recursos em uma linguagem coerente, pronta para virar assinatura.`);
  return bits.slice(0, 3).join(' ');
}

/** 2-3 extra sentences explaining o "porquê" do ajuste com base no gap declarado. */
export function adjustmentEnrichmentSentences(q: Dict | null | undefined): string {
  if (!q) return '';
  const percep = join(asArr((q as any).percepcaoAtual));
  const lembrada = s((q as any).comoQuerSerLembrada);
  const palavras = join(asArr((q as any).palavrasTransmitir));
  const desafios = join(asArr((q as any).desafiosCorpo));
  const bits: string[] = [];
  if (percep && (lembrada || palavras)) {
    bits.push(`O ajuste nasce do gap entre a percepção atual (${lc(percep)}) e como você deseja ser lembrada (${lc(lembrada || palavras)}).`);
  } else if (percep) {
    bits.push(`O ajuste parte da percepção atual que você mesma descreveu: ${lc(percep)}.`);
  } else if (lembrada || palavras) {
    bits.push(`O ajuste parte da forma como você deseja ser lembrada: ${lc(lembrada || palavras)}.`);
  }
  if (desafios) bits.push(`Ele endereça também os pontos do corpo sinalizados como desafio (${lc(desafios)}), tratados por corte e caimento — não por camuflagem.`);
  bits.push('Refinar essa ponte é o que transforma o mesmo guarda-roupa em leitura editorial.');
  return bits.slice(0, 3).join(' ');
}

/** 2-3 itens extras específicos do estilo, para preencher a caixa "Evitar" da Assinatura Visual. */
export function styleAvoidExtras(style: string | undefined | null): string[] {
  const key = lc(style || '');
  if (key.includes('clás') || key.includes('elegant')) return [
    'Peças hipertendência de temporada que envelhecem em três meses e quebram a leitura atemporal.',
    'Modelagens muito justas em tecidos brilhantes — competem com a sobriedade que constrói autoridade.',
    'Mix de mais de dois metais no mesmo look, que polui o refino do estilo clássico.',
  ];
  if (key.includes('rom') || key.includes('femin')) return [
    'Alfaiataria dura e ombros exageradamente estruturados que apagam o traço romântico.',
    'Estampas gráficas fortes e geométricas que conflitam com a linguagem fluida.',
    'Acessórios industriais ou masculinizados que quebram a delicadeza da assinatura.',
  ];
  if (key.includes('mod') || key.includes('minim') || key.includes('contemp')) return [
    'Excesso de detalhes decorativos (babados, laços, apliques) que sujam a leitura minimalista.',
    'Estampas florais tradicionais que puxam o look para um registro conservador.',
    'Combinações com muitas cores simultâneas — o estilo pede paleta contida.',
  ];
  if (key.includes('crea') || key.includes('cria') || key.includes('editorial')) return [
    'Uniformização em básicos monocromáticos que anula sua assinatura criativa.',
    'Silhuetas totalmente convencionais sem nenhum elemento de tensão ou proporção inesperada.',
    'Acessórios genéricos "seguros" — o estilo pede escolha autoral, mesmo que discreta.',
  ];
  return [
    'Peças de tendência descartável que não conversam com a linguagem calculada acima.',
    'Combinações barulhentas (mais de duas cores fortes + estampa) que diluem a assinatura.',
    'Acabamentos frágeis (costuras aparentes, tecidos amarrotados) que descem o padrão editorial.',
  ];
}

/**
 * Justificativa ÚNICA por ação, específica ao conteúdo do item — nunca a mesma
 * frase entre dois itens da lista "O Que Apostar". Ancora-se em dados reais do
 * perfil (estilo, paleta, ocasiões, objetivo) sempre que disponíveis.
 */
export function betOnMotivoFallback(
  nome: string,
  d: Dict | undefined | null,
  q?: Dict | null,
  index = 0,
): string {
  const mp = (d?.master_profile as Dict | undefined) ?? {};
  const estilo = s(mp.estilo_predominante) || s((d as any)?.assinatura) || 'sua assinatura';
  const cargo = s(mp.cargo_e_autoridade) || s(mp.profissao) || s((q as any)?.profissao);
  const paleta = s(mp.paleta) || s((d as any)?.estacao_coloracao) || s((d as any)?.estacao);
  const objetivo = join(asArr((q as any)?.objetivosImagem)) || s((q as any)?.comoQuerSerLembrada);
  const ocasioes = join(asArr((q as any)?.ocasioes)) || join(asArr((q as any)?.ocasioesFrequentes));
  const key = lc(nome || '');

  // Match por palavras-chave da ação; cada ramo devolve um enfoque distinto.
  if (/revisar|guarda-roupa|inventário|inventario|auditar/.test(key)) {
    return `Faz o inventário do que você já tem conversar com ${lc(estilo)}: o que reforça a leitura fica, o que compete sai — sem gastar antes de entender o próprio acervo.`;
  }
  if (/essenci|básic|basic|peça-chave|pecas-chave/.test(key)) {
    return `Instala a base neutra que ${lc(estilo)} exige — peças de corte impecável que se combinam entre si e reduzem em 80% o esforço de montar looks${cargo ? ` para ${lc(cargo)}` : ''}.`;
  }
  if (/paleta|cor|coloração|coloracao|subtom/.test(key)) {
    return paleta
      ? `Fixa a paleta ${lc(paleta)} como filtro de decisão: cada compra passa pelo teste de harmonia com seu subtom, evitando peças bonitas isoladas mas que morrem no seu rosto.`
      : `Define o eixo cromático da sua imagem — subtom, contrastes e cores-âncora — para que qualquer peça nova entre em harmonia imediata com o resto do closet.`;
  }
  if (/ocasi|contexto|calend/.test(key)) {
    return ocasioes
      ? `Endereça exatamente as ocasiões que você declarou (${lc(ocasioes)}): cada uma ganha um look-fórmula pronto, eliminando a fricção do "não tenho o que vestir".`
      : `Mapeia sua semana real por contexto (trabalho, social, viagem, lazer) e cria um look-fórmula para cada um — a decisão diária vira quase automática.`;
  }
  if (/3 looks|três looks|começar|comecar|primeiro/.test(key)) {
    return `Prova o método com três looks completos e replicáveis${ocasioes ? ` para ${lc(ocasioes)}` : ''}: você sente o impacto real na leitura antes de investir em volume, e cada acerto ancora as próximas compras.`;
  }
  if (/silhueta|corte|caiment|modelagem/.test(key)) {
    return `Ajusta as modelagens à sua silhueta específica — o mesmo tecido, no corte certo, muda a percepção de autoridade sem depender de tendência.`;
  }
  if (/acessó|acesso|joia|bolsa|sapato/.test(key)) {
    return `Usa acessório como assinatura silenciosa: um único ponto focal por look reforça ${lc(estilo)} e sinaliza intenção estética sem competir com o rosto.`;
  }
  if (/investi|qualidade|premium/.test(key)) {
    return `Concentra o orçamento em poucas peças de acabamento superior — elas duram anos, sobem a leitura editorial e diluem o custo por uso.`;
  }
  if (/rotina|hábito|habito|processo/.test(key)) {
    return `Transforma vestir-se em processo curto e previsível${cargo ? ` compatível com ${lc(cargo)}` : ''}: menos decisão diária, mais consistência de imagem.`;
  }

  // Fallback ainda assim único por posição — evita duplicidade textual.
  const angulos = [
    `Ancora ${lc(estilo)} em uma escolha concreta${objetivo ? `, alinhada ao seu objetivo de ${lc(objetivo)}` : ''}.`,
    `Reduz atrito prático${cargo ? ` na sua rotina de ${lc(cargo)}` : ''} e libera energia para o que importa na sua imagem.`,
    `Sustenta consistência visual entre contextos, sem depender de tendência de temporada.`,
    `Traduz intenção estética em decisão cotidiana — a imagem passa a comunicar sem esforço.`,
    `Cria coerência entre peças já existentes e as próximas compras, protegendo o investimento.`,
  ];
  return angulos[index % angulos.length];
}

/** Parágrafo interpretando o padrão dos 6 eixos da Estratégia de Imagem. */
export function strategyInterpretation(metrics: Array<{ label: string; value: number }>): string {
  if (!metrics?.length) return '';
  const sorted = [...metrics].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 2).map((m) => lc(m.label));
  const low = lc(sorted[sorted.length - 1].label);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return `O padrão coloca ${top.join(' e ')} como eixos mais fortes da sua leitura — é por eles que seu guarda-roupa deve priorizar investimento e tempo de curadoria. ${cap(low)} aparece mais discreto, o que sugere calibrar esse eixo com escolhas pontuais (uma peça, um acessório, um corte) sem desalinhar os demais. Na prática, cada compra deve reforçar os dois eixos altos antes de tentar reequilibrar o mais baixo.`;
}
