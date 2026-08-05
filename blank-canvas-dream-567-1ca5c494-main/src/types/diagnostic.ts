// EST ELITE — Diagnostic data shape used by the image prompt builders.

export interface DiagnosticData {
  userId: string;
  /** Stable signature of the exact diagnosis/questionnaire used for image variation. */
  imageFingerprint?: string;

  // Estilo de Vida
  estiloDeVida: string;
  profissao: string;
  ocasiao: OcasiaoType;
  orcamento: OrcamentoType;
  clima: ClimaType;

  // Dados Corporais
  altura: number;
  peso: number;
  tamanhoSuperior: string;
  tamanhoInferior: string;
  tipoCorporal: TipoCorporalType;
  caimento: CaimentoType;
  formalidade: FormalidadeType;
  observacoesCorpo?: string;

  // Coloração
  corCabelo: string;
  corOlhos: string;
  tomDePele: TomDePeleType;

  // Estilo
  estiloPersonalidade: EstiloType;

  // Objetivos
  objetivos: string;
  desafios?: string;

  // Restrictions / avoid lists (used by the image search filter)
  restricoes?: string[];
  tecidosEvitar?: string[];
  elementosEvitar?: string[];
  decotesEvitar?: string[];
  coresEvitar?: string[];
  estampasEvitar?: string[];
}


export type OcasiaoType =
  | "Trabalho/Escritório"
  | "Casual/Dia a dia"
  | "Eventos sociais"
  | "Ocasiões formais"
  | "Esportes/Academia"
  | "Viagens";

export type ClimaType =
  | "Tropical (quente o ano todo)"
  | "Subtropical (verões quentes, invernos amenos)"
  | "Temperado (4 estações)"
  | "Frio (invernos rigorosos)";

export type TipoCorporalType =
  | "Ampulheta"
  | "Triângulo Invertido"
  | "Triângulo"
  | "Retângulo"
  | "Oval";

export type CaimentoType =
  | "Bem ajustado"
  | "Levemente ajustado"
  | "Reto"
  | "Folgado"
  | "Oversized";

export type FormalidadeType =
  | "Casual"
  | "Smart Casual"
  | "Business Casual"
  | "Formal"
  | "Black Tie";

export type TomDePeleType =
  | "Muito Claro"
  | "Claro"
  | "Médio"
  | "Escuro"
  | "Muito Escuro";

export type EstiloType =
  | "Clássico e atemporal"
  | "Romântico e delicado"
  | "Moderno e minimalista"
  | "Ousado e marcante"
  | "Boho e despojado"
  | "Elegante e sofisticado";

export type OrcamentoType =
  | "Até R$ 500"
  | "R$ 500 - R$ 1.500"
  | "R$ 1.500 - R$ 3.000"
  | "Acima de R$ 3.000";
