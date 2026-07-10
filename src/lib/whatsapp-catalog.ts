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
  1: {
    title: "Lavagem",
    keys: ["lavagem_simples", "lavagem_completa", "lavagem_detalhada"],
  },
  2: { title: "Polimento", keys: ["polimento_cotacao"] },
  3: {
    title: "Proteção & Brilho",
    keys: [
      "descontaminacao_pintura",
      "descontaminacao_vidro",
      "cristalizacao_farois",
      "revitalizacao_pintura",
      "descontaminacao",
      "limpeza_premium",
    ],
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
  5: {
    title: "Detalhes Especiais",
    keys: ["limpeza_motor"],
  },
  6: { title: "Revitalização", keys: [] },
  7: { title: "Pacotes Premium", keys: ["pacotes"] },
  8: { title: "Ajuda na escolha", keys: ["indeciso"] },
};

export const CATALOG: Record<string, CatalogItem> = {
  lavagem_simples: {
    key: "lavagem_simples",
    label: "Lavagem Simples",
    short: "Ducha completa, secagem, aplicação de pretinho nos plásticos externos e limpeza interna básica.",
    pitch: "Ideal para manutenção rápida do veículo.",
    dbMatch: "Lavagem Simples",
    time: "60 min",
    ...price(55),
  },
  lavagem_completa: {
    key: "lavagem_completa",
    label: "Lavagem Completa",
    short: "Ducha, secagem, limpeza interna básica, aplicação de pretinho, revitalização de plásticos externos, cera líquida e vidros.",
    pitch: "Mais completa que a simples, com acabamento mais completo.",
    dbMatch: "Lavagem Completa",
    time: "90 min",
    ...price(75),
  },
  lavagem_detalhada: {
    key: "lavagem_detalhada",
    label: "Lavagem Detalhada",
    short: "Ducha, secagem, limpeza interna detalhada, cera em pasta, pretinho, plásticos, caixas de roda, vidros, tapetes e cheirinho.",
    pitch: "O pacote mais completo, com atenção a cada detalhe do veículo.",
    dbMatch: "Lavagem Detalhada",
    time: "120 min",
    ...price(100),
  },
  limpeza_motor: {
    key: "limpeza_motor",
    label: "Lavagem Técnica do Motor",
    short: "Limpeza técnica e segura do compartimento do motor com produtos adequados.",
    pitch: "Limpeza técnica que preserva componentes elétricos e eletrônicos.",
    dbMatch: "Lavagem Técnica do Motor",
    time: "60 min",
    ...price(145),
  },
  cristalizacao_farois: {
    key: "cristalizacao_farois",
    label: "Cristalização de Faróis",
    short: "Polimento e cristalização de faróis para remover embaçamento e amarelamento.",
    pitch: "Recupera transparência e melhora iluminação noturna.",
    dbMatch: "Cristalização de Faróis",
    time: "90 min",
    ...price(125),
  },
  descontaminacao_pintura: {
    key: "descontaminacao_pintura",
    label: "Descontaminação de Pintura e Aplicação de Cera Nobre",
    short: "Remoção de contaminantes da pintura seguida de aplicação de cera nobre.",
    pitch: "Proteção e brilho com acabamento de vitrine.",
    dbMatch: "Descontaminação de Pintura",
    time: "60 min",
    ...price(115),
  },
  descontaminacao_vidro: {
    key: "descontaminacao_vidro",
    label: "Descontaminação de Vidro",
    short: "Remoção de resíduos aderidos aos vidros, restaurando clareza e visibilidade.",
    pitch: "Melhora visibilidade em dias de chuva e acabamento do vidro.",
    dbMatch: "Descontaminação de Vidro",
    time: "60 min",
    ...price(95),
  },
  higienizacao_tecido: {
    key: "higienizacao_tecido",
    label: "Higienização dos Bancos de Tecido",
    short: "Limpeza profunda dos bancos de tecido, removendo manchas, odores e ácaros.",
    pitch: "Protege e renova o tecido dos bancos.",
    dbMatch: "Higienização dos Bancos de Tecido",
    time: "90 min",
    ...price(105),
  },
  higienizacao_couro: {
    key: "higienizacao_couro",
    label: "Higienização Bancos de Couro",
    short: "Limpeza e hidratação de bancos de couro, removendo sujeira acumulada.",
    pitch: "Previne ressecamento e mantém o couro macio.",
    dbMatch: "Higienização Bancos de Couro",
    time: "90 min",
    ...price(85),
  },
  higienizacao_tecido_completa: {
    key: "higienizacao_tecido_completa",
    label: "Higienização dos Bancos, Teto e Carpete (Tecido)",
    short: "Higienização completa de interior forrado em tecido: bancos, teto e carpete.",
    pitch: "Extração profunda de sujeira e eliminação de odores.",
    dbMatch: "Higienização dos Bancos, Teto e Carpete (Tecido)",
    time: "150 min",
    ...price(175),
  },
  higienizacao_couro_completa: {
    key: "higienizacao_couro_completa",
    label: "Higienização dos Bancos, Teto e Carpete (Couro)",
    short: "Higienização completa de interior com acabamento em couro.",
    pitch: "Limpeza e hidratação adequadas ao couro.",
    dbMatch: "Higienização dos Bancos, Teto e Carpete (Couro)",
    time: "150 min",
    ...price(155),
  },
  polimento_cotacao: {
    key: "polimento_cotacao",
    label: "Polimento",
    short: "Polimento técnico para remoção de riscos e imperfeições — valor sob consulta.",
    pitch: "Agende uma avaliação presencial para cotação personalizada.",
    dbMatch: "Polimento",
    time: "sob consulta",
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
