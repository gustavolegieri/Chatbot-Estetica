/** Catálogo Garagem do Ka — serviços, preços e categorias */

export const BRAND_DEFAULT = "Garagem do Ka";

export const MAIN_MENU_CATEGORIES = 8;

export interface CatalogItem {
  key: string;
  label: string;
  short: string;
  pitch: string;
  dbMatch: string;
  time: string;
  hatchMin: number;
  hatchMax: number;
  suvMin: number;
  suvMax: number;
}

function price(p: number) {
  return { hatchMin: p, hatchMax: p, suvMin: p, suvMax: p };
}

export const CATEGORIES: Record<number, { title: string; keys: string[] }> = {
  1: { title: "Lavagem", keys: ["lavagem_simples", "lavagem_completa", "lavagem_detalhada"] },
  2: { title: "Polimento", keys: ["polimento_cotacao"] },
  3: {
    title: "Proteção & Brilho",
    keys: ["descontaminacao_pintura", "cristalizacao_farois"],
  },
  4: {
    title: "Interior",
    keys: [
      "higienizacao_tecido",
      "higienizacao_tecido_completa",
      "higienizacao_couro",
      "higienizacao_couro_completa",
    ],
  },
  5: { title: "Detalhes Especiais", keys: ["limpeza_motor", "descontaminacao_vidro"] },
  6: {
    title: "Revitalização",
    keys: ["revitalizacao_pintura", "descontaminacao", "limpeza_premium"],
  },
  7: { title: "Pacotes Premium", keys: ["pacotes"] },
  8: { title: "Ajuda na escolha", keys: ["indeciso"] },
};

export const CATALOG: Record<string, CatalogItem> = {
  lavagem_simples: {
    key: "lavagem_simples",
    label: "Lavagem Simples",
    short: "Ducha, secagem, pretinho e limpeza interna básica.",
    pitch: "Ideal para manutenção regular do visual.",
    dbMatch: "Lavagem Simples",
    time: "1h a 1h30",
    ...price(55),
  },
  lavagem_completa: {
    key: "lavagem_completa",
    label: "Lavagem Completa",
    short: "Lavagem completa com cera líquida, plásticos e vidros.",
    pitch: "Mais completa que a simples, com acabamento premium.",
    dbMatch: "Lavagem Completa",
    time: "1h30 a 2h",
    ...price(75),
  },
  lavagem_detalhada: {
    key: "lavagem_detalhada",
    label: "Lavagem Detalhada",
    short: "Limpeza interna detalhada, cera em pasta, tapetes e cheirinho.",
    pitch: "Cada detalhe do carro tratado com atenção.",
    dbMatch: "Lavagem Detalhada",
    time: "2h a 3h",
    ...price(100),
  },
  limpeza_motor: {
    key: "limpeza_motor",
    label: "Lavagem Técnica do Motor",
    short: "Limpeza técnica e segura do compartimento do motor.",
    pitch: "Visual impecável e facilita identificar vazamentos.",
    dbMatch: "Lavagem técnica do motor",
    time: "1h30 a 2h",
    ...price(145),
  },
  cristalizacao_farois: {
    key: "cristalizacao_farois",
    label: "Cristalização de Faróis",
    short: "Recupera transparência e aparência dos faróis.",
    pitch: "Melhora estética e visibilidade noturna.",
    dbMatch: "Cristalização de faróis",
    time: "1h a 1h30",
    ...price(125),
  },
  descontaminacao_pintura: {
    key: "descontaminacao_pintura",
    label: "Descontaminação + Cera Nobre",
    short: "Descontaminação de pintura com aplicação de cera nobre.",
    pitch: "Remove contaminantes e protege a pintura.",
    dbMatch: "Descontaminação de pintura",
    time: "2h a 3h",
    ...price(115),
  },
  higienizacao_tecido: {
    key: "higienizacao_tecido",
    label: "Higienização Bancos (Tecido)",
    short: "Higienização profunda dos bancos de tecido.",
    pitch: "Elimina odores, manchas e ácaros dos bancos.",
    dbMatch: "Higienização bancos tecido",
    time: "2h a 3h",
    ...price(105),
  },
  higienizacao_tecido_completa: {
    key: "higienizacao_tecido_completa",
    label: "Higienização Completa (Tecido)",
    short: "Bancos, teto e carpete em tecido.",
    pitch: "Interior renovado por completo.",
    dbMatch: "Higienização tecido completa",
    time: "3h a 4h",
    ...price(175),
  },
  higienizacao_couro: {
    key: "higienizacao_couro",
    label: "Higienização Bancos (Couro)",
    short: "Limpeza e tratamento dos bancos de couro.",
    pitch: "Couro limpo, hidratado e protegido.",
    dbMatch: "Higienização bancos couro",
    time: "1h30 a 2h",
    ...price(85),
  },
  higienizacao_couro_completa: {
    key: "higienizacao_couro_completa",
    label: "Higienização Completa (Couro)",
    short: "Bancos, teto e carpete em couro.",
    pitch: "Interior premium restaurado.",
    dbMatch: "Higienização couro completa",
    time: "3h a 4h",
    ...price(155),
  },
  descontaminacao_vidro: {
    key: "descontaminacao_vidro",
    label: "Descontaminação de Vidro",
    short: "Remove resíduos e melhora clareza dos vidros.",
    pitch: "Visibilidade e acabamento como novo.",
    dbMatch: "Descontaminação de vidro",
    time: "1h a 1h30",
    ...price(95),
  },
  polimento_cotacao: {
    key: "polimento_cotacao",
    label: "Polimento",
    short: "Correção de riscos e brilho profundo — valor sob avaliação.",
    pitch: "Agende uma avaliação presencial para cotação personalizada.",
    dbMatch: "Polimento",
    time: "sob avaliação",
    hatchMin: 0,
    hatchMax: 0,
    suvMin: 0,
    suvMax: 0,
  },
  revitalizacao_pintura: {
    key: "revitalizacao_pintura",
    label: "Revitalização de Pintura",
    short: "Recuperação estética completa da pintura.",
    pitch: "Para pinturas opacas, sem vida ou muito desgastadas.",
    dbMatch: "Polimento",
    time: "4h a 8h",
    hatchMin: 500,
    hatchMax: 800,
    suvMin: 750,
    suvMax: 1100,
  },
  descontaminacao: {
    key: "descontaminacao",
    label: "Descontaminação de Pintura",
    short: "Remove contaminantes antes de polir ou proteger.",
    pitch: "Prepara a pintura para resultado perfeito.",
    dbMatch: "Polimento",
    time: "1h30 a 3h",
    hatchMin: 200,
    hatchMax: 320,
    suvMin: 280,
    suvMax: 420,
  },
  limpeza_premium: {
    key: "limpeza_premium",
    label: "Limpeza Premium",
    short: "Detalhamento completo de acabamento externo.",
    pitch: "Acabamento impecável em cada detalhe.",
    dbMatch: "Lavagem",
    time: "2h a 4h",
    hatchMin: 150,
    hatchMax: 250,
    suvMin: 220,
    suvMax: 340,
  },
  pacotes: {
    key: "pacotes",
    label: "Pacotes Premium",
    short: "Combos com melhor custo-benefício.",
    pitch: "Proteção, brilho e detalhamento combinados.",
    dbMatch: "Detalhamento",
    time: "1 dia",
    hatchMin: 550,
    hatchMax: 900,
    suvMin: 900,
    suvMax: 1500,
  },
  indeciso: {
    key: "indeciso",
    label: "Consultoria",
    short: "Te ajudo a escolher o melhor serviço.",
    pitch: "",
    dbMatch: "Lavagem Simples",
    time: "—",
    hatchMin: 0,
    hatchMax: 0,
    suvMin: 0,
    suvMax: 0,
  },
};

export const UPSELL_BY_KEY: Record<string, { complement: string; benefit: string }> = {
  lavagem_detalhada: {
    complement: "Higienização Completa (Tecido)",
    benefit: "deixa o carro perfeito por dentro e por fora no mesmo dia.",
  },
  lavagem_completa: {
    complement: "Descontaminação de Vidro",
    benefit: "completa o visual com vidros cristalinos.",
  },
  descontaminacao_pintura: {
    complement: "Polimento",
    benefit: "maximiza o brilho após a descontaminação.",
  },
};

export const UNDECIDED_TO_KEY: Record<number, string> = {
  1: "lavagem_detalhada",
  2: "polimento_cotacao",
  3: "higienizacao_tecido_completa",
  4: "descontaminacao_pintura",
  5: "lavagem_completa",
};
