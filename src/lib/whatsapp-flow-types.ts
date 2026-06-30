/** Sem interação por 30 min → atendimento reinicia (cron + próxima mensagem) */
export const SESSION_RESET_MS = 30 * 60 * 1000;

export type FlowStage =
  | "ETAPA1_AWAITING_NAME"
  | "ETAPA2_MAIN_MENU"
  | "ETAPA2_SUB"
  | "ETAPA3_SERVICE_ACTION"
  | "ETAPA3_UNDECIDED_VEHICLE"
  | "ETAPA3_UNDECIDED_PROBLEM"
  | "ETAPA3_PACKAGE_ACTION"
  | "ETAPA4_VEHICLE"
  | "ETAPA5_QUOTE"
  | "ETAPA6_UPSELL"
  | "ETAPA7_PERIOD"
  | "ETAPA7_DAY"
  | "ETAPA7_TIME"
  | "ETAPA7_CUSTOM_DAY"
  | "ETAPA8_PAYMENT"
  | "ETAPA8_PAYMENT_NO_PIX"
  | "ETAPA10_FAQ"
  | "STALE_RETURN";

export interface FlowState {
  stage: FlowStage;
  welcomed?: boolean;
  customerName?: string;
  categoryNum?: number;
  serviceKey?: string;
  serviceNum?: number;
  serviceLabel?: string;
  dbServiceId?: string;
  packageKey?: string;
  vehicleRaw?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  vehicleCondition?: string;
  vehicleIsSuv?: boolean;
  /** Coleta em duas etapas: modelo → ano */
  vehicleCollectStep?: "model" | "year";
  quoteMin?: number;
  quoteMax?: number;
  estimatedTime?: string;
  upsellLabel?: string;
  upsellAccepted?: boolean;
  upsellOffered?: boolean;
  period?: "manha" | "tarde";
  periodLabel?: string;
  availableSlots?: string[];
  serviceDurationMin?: number;
  dayLabel?: string;
  dayDate?: string;
  startTime?: string;
  paymentMethod?: string;
  undecidedIssue?: number;
  returnStage?: FlowStage;
  /** Snapshot para retomar após inatividade */
  resumeStage?: FlowStage;
  /** Próxima mensagem do cliente deve receber boas-vindas (ex.: após handoff encerrado) */
  pendingWelcomeRestart?: boolean;
}

