import { BRAND_DEFAULT, CATALOG, type CatalogItem } from "./whatsapp-catalog";

export interface FlowContext {
  businessName: string;
  hours: string;
  address: string;
  pixKey: string | null;
  pixHolder: string | null;
  pixBank: string | null;
}

export function formatHours(start: string, end: string, workingDays: string) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const days = workingDays.split(",").map(Number);
  const range =
    days.length === 6 && !days.includes(0)
      ? "Segunda a sábado"
      : days.map((d) => labels[d]).join(", ");
  return `${range}, ${start} às ${end}`;
}

// ─────────────────────────────────────────────────────────────
// ETAPA 1 — BOAS-VINDAS
// ─────────────────────────────────────────────────────────────

export function etapa1Welcome(ctx: FlowContext) {
  const name = ctx.businessName || BRAND_DEFAULT;
  return [
    `Olá! Seja muito bem-vindo(a) à *${name}* 🚗✨`,
    ``,
    `Aqui não fazemos lavagem comum — somos especialistas em *estética automotiva premium*: serviços que cuidam, protegem e valorizam o seu veículo de verdade.`,
    ``,
    `O que fazemos por você:`,
    `🔹 *Lavagem detalhada* — muito além de água e sabão`,
    `🔹 *Polimento técnico* — riscos e opacidade eliminados`,
    `🔹 *Proteção de pintura* — vitrificação e cristalização`,
    `🔹 *Higienização interior* — renovação completa por dentro`,
    `🔹 *Detalhamentos completos* — carro como saído da concessionária`,
    ``,
    `📍 ${ctx.address || "Consulte nosso endereço"}`,
    `🕐 ${ctx.hours}`,
    ``,
    `Para começarmos, qual é o seu *nome*? 😊`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 2 — MENU PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function etapa2MainMenu(clientName: string) {
  return [
    `Que bom te ter aqui, *${clientName}*! 😊`,
    ``,
    `O que seu carro precisa hoje?`,
    ``,
    `*1* 💧 Lavagem`,
    `*2* ✨ Polimento`,
    `*3* 🛡️ Proteção & Brilho`,
    `*4* 🪑 Interior`,
    `*5* 🔄 Revitalização`,
    `*6* 🔬 Detalhes especiais`,
    `*7* 📦 Pacotes premium`,
    `*8* 🤔 Não sei qual preciso`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 3 — DETALHE DO SERVIÇO
// ─────────────────────────────────────────────────────────────

export function serviceDetail(item: CatalogItem) {
  if (item.key === "pacotes") {
    return [
      `📦 *Pacotes Premium — Garagem do Ka*`,
      ``,
      `Tudo que seu carro precisa em um único atendimento. Nossos combos entregam o máximo resultado pelo melhor custo-benefício:`,
      ``,
      `✦ *Detail Essencial* — a partir de R$ 550`,
      `   Lavagem detalhada + polimento + proteção básica`,
      `   _Ideal para manutenção regular do visual_`,
      ``,
      `✦ *Proteção Total* — a partir de R$ 900`,
      `   Polimento técnico + vitrificação cerâmica`,
      `   _Para quem quer proteção real e duradoura_`,
      ``,
      `✦ *Interior Premium* — a partir de R$ 380`,
      `   Higienização completa + couro + aromatização`,
      `   _Carro novo por dentro, sem exceção_`,
      ``,
      `✦ *Full Detail Ka* — a partir de R$ 1.400`,
      `   Exterior + interior + proteção cerâmica`,
      `   _O serviço mais completo que oferecemos_`,
      ``,
      `💬 Qual se encaixa melhor no que você precisa?`,
      ``,
      packageActionMenu(),
    ].join("\n");
  }

  const serviceTexts: Record<string, string[]> = {
    lavagem_tecnica: [
      `💧 *Lavagem Técnica*`,
      ``,
      `Lavagem completa, cuidadosa e sem riscos na pintura.`,
      ``,
      `O que inclui:`,
      `• Pré-lavagem com espuma ativa`,
      `• Lavagem manual (sem esponja, sem agressão à pintura)`,
      `• Limpeza de rodas e pneus`,
      `• Secagem com microfibra`,
      `• Aspiração interna básica`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Rápido, eficiente e seguro para a pintura._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    lavagem_simples: [
      `💧 *Lavagem Simples*`,
      ``,
      `Lavagem completa, cuidadosa e sem riscos na pintura.`,
      ``,
      `O que inclui:`,
      `• Pré-lavagem com espuma ativa`,
      `• Lavagem manual (sem esponja, sem agressão à pintura)`,
      `• Limpeza de rodas e pneus`,
      `• Secagem com microfibra`,
      `• Aspiração interna básica`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Rápido, eficiente e seguro para a pintura._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    lavagem_detalhada: [
      `💧 *Lavagem Detalhada*`,
      ``,
      `Não é uma lavagem qualquer. Cada centímetro do carro é tratado com atenção:`,
      ``,
      `• Pré-lavagem com espuma ativa que solta a sujeira sem agredir`,
      `• Lavagem manual completa com produtos premium`,
      `• Limpeza de rodas, pneus, soleiras e frisos`,
      `• Limpeza interna: tapetes, painel, vidros e detalhes`,
      `• Aplicação de finalizadores e protegentes`,
      `• Secagem total com microfibra`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Resultado muito superior à lavagem comum._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    polimento_comercial: [
      `✨ *Polimento Comercial*`,
      ``,
      `Realce de brilho e melhora visual rápida — ideal para eventos ou quando a pintura precisa de um up sem correção profunda.`,
      ``,
      `• Lavagem técnica de preparo`,
      `• Polimento leve para uniformizar o brilho`,
      `• Remoção de marcas superficiais leves`,
      `• Selante de proteção e acabamento`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Brilho renovado em menos tempo._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    polimento_tecnico: [
      `✨ *Polimento Técnico*`,
      ``,
      `Para pintura que perdeu o brilho, tem riscos superficiais ou marcas de lavagens antigas. O polimento remove a camada danificada e revela a cor original — parece tinta nova.`,
      ``,
      `• Avaliação da profundidade dos riscos`,
      `• Polimento em máquina orbital com compostos técnicos`,
      `• Correção de swirls, holograma e opacidade`,
      `• Lustro final com cera ou selante de proteção`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_O antes e depois é impressionante._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    polimento_cristalizacao: [
      `✨ *Polimento + Cristalização*`,
      ``,
      `O melhor dos dois mundos: corrige a pintura e já protege. Ideal para quem quer resultado e durabilidade num só serviço.`,
      ``,
      `• Polimento técnico para corrigir riscos e opacidade`,
      `• Cristalização com polímeros especiais`,
      `• Brilho intenso e profundo`,
      `• Proteção de 4 a 6 meses`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Sai como novo e fica protegido._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    vitrificacao: [
      `🛡️ *Vitrificação Cerâmica*`,
      ``,
      `A proteção mais duradoura disponível para pintura automotiva. Uma camada de cerâmica líquida cria uma barreira real contra:`,
      ``,
      `• Chuva ácida e contaminação atmosférica`,
      `• Riscos superficiais e arranhões leves`,
      `• Raios UV e desbotamento da cor`,
      `• Sujeira que adere à pintura`,
      ``,
      `O brilho fica intenso, profundo e duradouro. Manutenção muito mais fácil.`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Proteção que dura anos, não meses._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    protecao_ceramica: [
      `🛡️ *Proteção Cerâmica*`,
      ``,
      `Camada cerâmica premium para máxima proteção e brilho de vitrine. Indicada para quem quer o melhor em durabilidade.`,
      ``,
      `• Descontaminação e preparo da pintura`,
      `• Aplicação de coating cerâmico de alta performance`,
      `• Proteção contra UV, chuva ácida e contaminação`,
      `• Manutenção facilitada por anos`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Durabilidade superior e acabamento impecável._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    cristalizacao: [
      `💎 *Cristalização*`,
      ``,
      `Proteção e brilho num só tratamento. Compostos especiais selam a pintura, entregam visual de showroom e protegem por meses.`,
      ``,
      `• Descontaminação e preparo da pintura`,
      `• Aplicação de selante com polímeros de alta performance`,
      `• Brilho intenso e uniforme`,
      `• Proteção de 4 a 6 meses`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Resultado imediato, proteção duradoura._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    espelhamento: [
      `✨ *Espelhamento*`,
      ``,
      `Acabamento espelhado com alto nível de reflexo — visual de vitrine que impressiona.`,
      ``,
      `• Preparação e descontaminação da pintura`,
      `• Polimento de alto nível para reflexo profundo`,
      `• Selagem para fixar o brilho`,
      `• Acabamento uniforme em toda a lataria`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Visual impactante e acabamento premium._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    higienizacao: [
      `🪑 *Higienização Interior*`,
      ``,
      `O interior acumula muito mais do que parece: bactérias, ácaros, odores impregnados, manchas difíceis. Nossa higienização elimina tudo isso com fundo:`,
      ``,
      `• Extração profunda de tapetes, bancos e carpetes`,
      `• Limpeza de todas as superfícies: painel, teto, cintos`,
      `• Eliminação de odores com ozônio ou aromatização`,
      `• Tratamento específico para manchas difíceis`,
      `• Remoção de ácaros e agentes alérgenos`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Interior renovado de verdade._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    higienizacao_interna: [
      `🪑 *Higienização Interna*`,
      ``,
      `O interior acumula muito mais do que parece: bactérias, ácaros, odores impregnados, manchas difíceis. Nossa higienização elimina tudo isso com fundo:`,
      ``,
      `• Extração profunda de tapetes, bancos e carpetes`,
      `• Limpeza de todas as superfícies: painel, teto, cintos`,
      `• Eliminação de odores com ozônio ou aromatização`,
      `• Tratamento específico para manchas difíceis`,
      `• Remoção de ácaros e agentes alérgenos`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Interior renovado de verdade._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    limpeza_couro: [
      `🪑 *Limpeza e Hidratação de Couro*`,
      ``,
      `Bancos de couro exigem cuidado específico. Sem tratamento regular, ressecam, racham e perdem a cor. Nosso processo cuida de verdade:`,
      ``,
      `• Limpeza com produtos específicos para couro`,
      `• Remoção de manchas, oleosidade e sujeira profunda`,
      `• Hidratação com condicionadores premium`,
      `• Proteção que evita ressecamento futuro`,
      `• Recuperação de cor e textura`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Couro preservado e bonito por muito mais tempo._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    hidratacao_couro: [
      `🪑 *Hidratação de Couro*`,
      ``,
      `Bancos de couro exigem cuidado específico. Sem tratamento regular, ressecam, racham e perdem a cor. Nosso processo cuida de verdade:`,
      ``,
      `• Limpeza com produtos específicos para couro`,
      `• Remoção de manchas, oleosidade e sujeira profunda`,
      `• Hidratação com condicionadores premium`,
      `• Proteção que evita ressecamento futuro`,
      `• Recuperação de cor e textura`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Couro preservado e bonito por muito mais tempo._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    revitalizacao: [
      `🔄 *Revitalização Completa*`,
      ``,
      `Para o carro que precisa de um reset completo — por dentro e por fora. Recomendado quando o veículo está sem aquele brilho de quando era novo:`,
      ``,
      `• Lavagem detalhada externa`,
      `• Polimento para restaurar o brilho da pintura`,
      `• Higienização completa do interior`,
      `• Tratamento de plásticos externos (borrachas, para-choques)`,
      `• Finalizadores em todos os detalhes`,
      `• Resultado: carro outro`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_O carro que você conheceu de volta._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    revitalizacao_pintura: [
      `🔄 *Revitalização de Pintura*`,
      ``,
      `Para pinturas opacas, sem vida ou muito desgastadas — recuperação estética completa da lataria:`,
      ``,
      `• Avaliação do estado da pintura`,
      `• Descontaminação e preparo`,
      `• Polimento técnico para restaurar cor e brilho`,
      `• Proteção final conforme necessidade`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Pintura com vida e brilho de novo._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    descontaminacao: [
      `🔬 *Descontaminação de Pintura*`,
      ``,
      `Remove contaminantes da pintura antes de polir ou proteger — etapa essencial para resultado perfeito:`,
      ``,
      `• Avaliação da superfície`,
      `• Clay bar e produtos químicos específicos`,
      `• Eliminação de resíduos metálicos e industriais`,
      `• Pintura pronta para o próximo tratamento`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Base ideal para polimento ou proteção._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    limpeza_premium: [
      `✨ *Limpeza Premium*`,
      ``,
      `Detalhamento completo de acabamento externo — cada detalhe tratado com padrão premium:`,
      ``,
      `• Lavagem técnica profunda`,
      `• Limpeza de emblemas, frisos e vãos`,
      `• Tratamento de borrachas e plásticos`,
      `• Finalizadores e proteção de acabamento`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Acabamento impecável em cada detalhe._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    motor: [
      `🔧 *Limpeza de Motor*`,
      ``,
      `Motor limpo não é só estética — facilita identificar vazamentos e prolonga a vida dos componentes. Fazemos com cuidado e proteção total:`,
      ``,
      `• Proteção de todos os componentes elétricos`,
      `• Aplicação de desengraxante profissional`,
      `• Limpeza manual de detalhes e mangueiras`,
      `• Enxágue controlado sem pressão excessiva`,
      `• Aplicação de conservante e finalizador`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Motor limpo, manutenção mais fácil._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    limpeza_motor: [
      `🔧 *Limpeza de Motor*`,
      ``,
      `Motor limpo não é só estética — facilita identificar vazamentos e prolonga a vida dos componentes. Fazemos com cuidado e proteção total:`,
      ``,
      `• Proteção de todos os componentes elétricos`,
      `• Aplicação de desengraxante profissional`,
      `• Limpeza manual de detalhes e mangueiras`,
      `• Enxágue controlado sem pressão excessiva`,
      `• Aplicação de conservante e finalizador`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Motor limpo, manutenção mais fácil._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    farol: [
      `💡 *Restauração de Faróis*`,
      ``,
      `Faróis amarelados e opacos reduzem a iluminação e prejudicam o visual do carro. Nossa restauração devolve a transparência original:`,
      ``,
      `• Polimento progressivo das lentes com compostos específicos`,
      `• Remoção completa da oxidação superficial`,
      `• Lacagem UV para proteção duradoura`,
      `• Resultado visual imediato e impressionante`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Faróis como novos, sem troca._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    restauracao_farois: [
      `💡 *Restauração de Faróis*`,
      ``,
      `Faróis amarelados e opacos reduzem a iluminação e prejudicam o visual do carro. Nossa restauração devolve a transparência original:`,
      ``,
      `• Polimento progressivo das lentes com compostos específicos`,
      `• Remoção completa da oxidação superficial`,
      `• Lacagem UV para proteção duradoura`,
      `• Resultado visual imediato e impressionante`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Faróis como novos, sem troca._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
    chuva_acida: [
      `🌧️ *Remoção de Chuva Ácida*`,
      ``,
      `Manchas de chuva ácida são minerais que se depositam na pintura — e ficam cada vez mais difíceis de remover quanto mais tempo passam. Tratamento rápido, resultado melhor:`,
      ``,
      `• Avaliação do nível de contaminação`,
      `• Descontaminação química da superfície`,
      `• Polimento leve para recuperar o brilho`,
      `• Selamento preventivo contra nova contaminação`,
      ``,
      item.pitch ? `_${item.pitch}_` : `_Manchas eliminadas, pintura restaurada._`,
      ``,
      `⏱️ ${item.time}`,
      `💰 Valor confirmado na avaliação presencial`,
    ],
  };

  const lines = serviceTexts[item.key] ?? [
    `🔧 *${item.label}*`,
    ``,
    item.short,
    ``,
    item.pitch ? `_${item.pitch}_` : ``,
    ``,
    `⏱️ ${item.time}`,
    `💰 Valor confirmado na avaliação presencial`,
  ];

  return [...lines.filter((l) => l !== undefined), ``, serviceActionMenu()].join("\n");
}

export function serviceActionMenu() {
  return [
    `O que você quer fazer?`,
    ``,
    `*1* 📅 Quero agendar`,
    `*2* 🔄 Ver outros serviços`,
    `*3* 💬 Tenho uma dúvida`,
  ].join("\n");
}

export function packageActionMenu() {
  return [
    `*1* 📅 Agendar um pacote`,
    `*2* 🔍 Comparar pacotes`,
    `*3* 🔧 Ver serviços avulsos`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 4 — VEÍCULO
// ─────────────────────────────────────────────────────────────

export function etapa4Vehicle(hasVehicle: boolean) {
  if (hasVehicle) {
    return [
      `Perfeito — já tenho seu veículo anotado 🚗`,
      `Vamos para o orçamento!`,
    ].join("\n");
  }
  return [
    `Qual é o *modelo* do seu veículo? 🚗`,
    ``,
    `_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_`,
    ``,
    `_Ou envie modelo e ano juntos: *Civic 2021*_`,
  ].join("\n");
}

export function etapa4AskYear(model: string) {
  return [
    `Anotado: *${model}* 👍`,
    ``,
    `Qual o *ano* do veículo?`,
    ``,
    `_Exemplo: 2021, 2019, 2018_`,
  ].join("\n");
}

export function vehicleModelNotUnderstood() {
  return [
    `Não identifiquei o modelo 😅`,
    ``,
    `Envie só o *modelo* do carro (marca/modelo):`,
    `_Ex: Civic, Fiat Argo, Hilux SW4_`,
  ].join("\n");
}

export function vehicleYearNotUnderstood() {
  return [
    `Preciso do *ano* com 4 dígitos 😊`,
    ``,
    `_Exemplo: 2021, 2019, 2015_`,
  ].join("\n");
}

export function vehicleNotUnderstood() {
  return [
    `Não consegui validar o veículo 😅`,
    ``,
    `Envie *modelo e ano*, por exemplo:`,
    `_Civic 2021_`,
    `_Hilux 2019_`,
    `_Onix 2020_`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 5 — ORÇAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa5Quote(
  name: string,
  vehicle: string,
  service: string,
  min: number,
  max: number,
  time: string,
  pitch?: string
) {
  const hasValue = min > 0 && max > 0;
  const valueLine = hasValue
    ? `💰 *R$ ${min} a R$ ${max}*`
    : `💰 *Valor sob consulta — confirmado na avaliação*`;

  return [
    `Aqui está o orçamento para você, *${name}*:`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🚗 *Veículo:* ${vehicle}`,
    `🔧 *Serviço:* ${service}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    pitch ? `✨ ${pitch}` : ``,
    ``,
    valueLine,
    `⏱️ *Tempo estimado:* ${time}`,
    ``,
    `_O valor exato confirmamos na avaliação presencial — às vezes o carro surpreende para melhor ou para pior 😊_`,
    ``,
    `O que você quer fazer?`,
    ``,
    `*1* 📅 Agendar agora`,
    `*2* 🔄 Ver outro serviço`,
    `*3* 💬 Tenho dúvidas antes`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 6 — UPSELL
// ─────────────────────────────────────────────────────────────

export function etapa6Upsell(service: string, complement: string, benefit: string) {
  return [
    `Uma sugestão rápida antes de agendar 💡`,
    ``,
    `Muitos clientes que fazem *${service}* aproveitam a visita e incluem *${complement}* no mesmo dia.`,
    ``,
    `Por quê faz sentido: ${benefit}`,
    ``,
    `Sai mais em conta junto e você aproveita melhor a ida 😊`,
    ``,
    `*1* ✅ Boa ideia, incluir ${complement}`,
    `*2* ➡️ Não, seguir só com ${service}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 7 — AGENDAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa7Day() {
  return [
    `Ótimo, vamos agendar! 📅`,
    ``,
    `Qual dia você prefere?`,
    ``,
    `*1* Segunda-feira`,
    `*2* Terça-feira`,
    `*3* Quarta-feira`,
    `*4* Quinta-feira`,
    `*5* Sexta-feira`,
    `*6* Sábado`,
    ``,
    `_Ou escreva: *amanhã*, *sexta*, *15/06*_ 📆`,
  ].join("\n");
}

export function etapa7Time(dayLabel: string, slots: string[], durationLabel: string) {
  if (slots.length === 0) {
    return etapa7NoSlots(dayLabel);
  }
  const lines = slots.slice(0, 14).map((s, i) => `*${i + 1}* — ${s}`);
  return [
    `Horários disponíveis em *${dayLabel}*:`,
    ``,
    `_Seu serviço leva ~*${durationLabel}* — esse intervalo fica bloqueado na agenda._`,
    ``,
    ...lines,
    ``,
    `_Ou digite o horário, ex: *09:00*_`,
  ].join("\n");
}

export function etapa7NoSlots(dayLabel: string) {
  return [
    `Não há horários livres em *${dayLabel}* para a duração do seu serviço 😔`,
    ``,
    `Escolha outro dia:`,
    ``,
    etapa7Day(),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 8 — PAGAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa8Payment(hasPix: boolean) {
  const options = hasPix
    ? [`*1* PIX`, `*2* Débito`, `*3* Crédito`, `*4* Dinheiro`]
    : [`*1* Débito`, `*2* Crédito`, `*3* Dinheiro`];

  return [
    `Quase lá! Só mais uma coisa 🎉`,
    ``,
    `Como você prefere pagar?`,
    ``,
    ...options,
    ``,
    `_Pagamento realizado no dia do serviço._`,
  ].join("\n");
}

export function etapa8PixBlock(ctx: FlowContext) {
  return [
    `━━━━━━━━━━━━━━━━━━━━`,
    `💸 *Dados para PIX*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔑 *Chave:* ${ctx.pixKey}`,
    `👤 *Titular:* ${ctx.pixHolder ?? ctx.businessName}`,
    ctx.pixBank ? `🏦 *Banco:* ${ctx.pixBank}` : ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Envie o comprovante no dia do serviço 😊_`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 9 — CONFIRMAÇÃO FINAL DO AGENDAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa9Confirm(data: {
  name: string;
  vehicle: string;
  services: string;
  day: string;
  time: string;
  payment: string;
  value: string;
  address: string;
  pixBlock?: string;
}) {
  const lines = [
    `🎉 *Agendamento Confirmado!*`,
    ``,
    `Tudo certo, *${data.name}*! Seu agendamento está registrado. Aqui está o resumo completo:`,
    ``,
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    `👤 *Cliente:* ${data.name}`,
    `🚗 *Veículo:* ${data.vehicle}`,
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    `🔧 *Serviço(s):* ${data.services}`,
    `📅 *Data:* ${data.day}`,
    `🕐 *Horário:* ${data.time}`,
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    `💳 *Pagamento:* ${data.payment}`,
    `💰 *Valor estimado:* ${data.value}`,
    `_↳ Valor exato confirmado na avaliação presencial_`,
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    `📍 *Onde nos encontrar:*`,
    data.address,
  ];

  if (data.pixBlock) {
    lines.push(``, data.pixBlock);
  }

  lines.push(
    ``,
    `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
    `📌 *O que acontece agora:*`,
    ``,
    `1️⃣ Você receberá uma confirmação no dia anterior`,
    `2️⃣ No dia, é só chegar no horário combinado`,
    `3️⃣ A gente cuida do resto — promessa 💎`,
    ``,
    `Dúvida de última hora? Manda mensagem aqui mesmo 😊`,
    ``,
    `⏰ *4h antes* enviamos lembrete — responda *CONFIRME* para garantir o horário.`,
    ``,
    `Te esperamos, *${data.name}*! Vai sair incrível 🚗✨`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// STALE RETURN — RETORNO APÓS INATIVIDADE
// ─────────────────────────────────────────────────────────────

export function staleReturnPrompt(flow?: {
  customerName?: string;
  vehicleRaw?: string;
  serviceLabel?: string;
  stage?: string;
}) {
  const name = flow?.customerName ? `, *${flow.customerName}*` : ``;
  const hasContext = flow?.vehicleRaw || flow?.serviceLabel;

  const contextLine =
    flow?.serviceLabel && flow?.vehicleRaw
      ? `Você estava vendo *${flow.serviceLabel}* para o seu *${flow.vehicleRaw}* 🚗`
      : flow?.serviceLabel
        ? `Você estava vendo *${flow.serviceLabel}* 🔧`
        : flow?.vehicleRaw
          ? `Você estava com seu *${flow.vehicleRaw}* em mãos 🚗`
          : `Você estava no meio de um agendamento.`;

  return [
    `Oi${name}! 😊`,
    ``,
    contextLine,
    ``,
    hasContext ? `Bora continuar de onde paramos?` : `Posso te ajudar com alguma coisa?`,
    ``,
    `*1* ✅ Sim, continua!`,
    `*2* 🔄 Quero começar do zero`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// CLIENTE INDECISO
// ─────────────────────────────────────────────────────────────

export function indecisiveVehiclePrompt() {
  return [
    `Sem problema — vou te ajudar a descobrir o melhor! 😊`,
    ``,
    `Qual o *modelo* do seu veículo?`,
    `_Ex: Civic, Hilux, Onix — ou *Civic 2021*_`,
  ].join("\n");
}

export function indecisiveProblemPrompt() {
  return [
    `Perfeito 🚗`,
    ``,
    `O que está acontecendo?`,
    ``,
    `*1* 🎨 Pintura opaca, riscada ou sem brilho`,
    `*2* 🪑 Interior com cheiro ruim ou muito sujo`,
    `*3* 🛡️ Quero proteger um carro novo ou recém-comprado`,
    `*4* ✨ Quero um cuidado geral completo`,
    `*5* 🔧 Outro problema`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

export function invalidMenu(menu: string) {
  return [
    `Ops, essa opção não existe 😅`,
    ``,
    `Escolhe uma dessas:`,
    ``,
    menu,
  ].join("\n");
}

export function quotePitchForService(key: string): string {
  const item = CATALOG[key];
  if (!item) return "";
  return item.pitch ?? "";
}
