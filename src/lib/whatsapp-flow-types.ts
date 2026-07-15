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
  | "ETAPA4_VEHICLE_CONFIRM"
  | "ETAPA5_QUOTE"
  | "ETAPA5_FIRST_TIME_BONUS"
  | "ETAPA6_UPSELL"
  | "ETAPA7_DAY"
  | "ETAPA7_TIME"
  | "ETAPA7_PERIOD" // LEGACY: mantido para compatibilidade
  | "ETAPA7_CUSTOM_DAY" // LEGACY: mantido para compatibilidade
  | "ETAPA9_COUPON"
  | "ETAPA9_LOYALTY"
  | "ETAPA9_REMINDER" // LEGACY: mantido para compatibilidade
  | "ETAPA10_BUDGET"
  | "ETAPA10_LOGISTICS"
  | "ETAPA8_PAYMENT"
  | "ETAPA8_PAYMENT_NO_PIX" // LEGACY: mantido para compatibilidade
  | "ETAPA8_PAYMENT_CARD_TYPE"
  | "ETAPA8_PIX_CHOICE"
  | "ETAPA8_RECEIPT_UPLOAD"
  | "ETAPA14_REMINDER"
  | "ETAPA15_SUMMARY_CONFIRM"
  | "ETAPA16_CONFIRMATION"
  | "ETAPA10_FAQ"
  | "ETAPA11_SERVICE_QUESTION" // LEGACY: mantido para compatibilidade
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
  vehicleCollectStep?: "model" | "year" | "color" | "condition";
  vehicleConfirmed?: boolean;
  reminderEnabled?: boolean;
  quoteMin?: number;
  quoteMax?: number;
  estimatedTime?: string;
  upsellLabel?: string;
  upsellAccepted?: boolean;
  upsellOffered?: boolean;
  upsellValue?: number;
  availableSlots?: string[];
  serviceDurationMin?: number;
  dayLabel?: string;
  dayDate?: string;
  startTime?: string;
  periodLabel?: string; // Para compatibilidade com código existente
  paymentMethod?: string;
  undecidedIssue?: number;
  returnStage?: FlowStage;
  /** Snapshot para retomar após inatividade */
  resumeStage?: FlowStage;
  /** Próxima mensagem do cliente deve receber boas-vindas (ex.: após handoff encerrado) */
  pendingWelcomeRestart?: boolean;

  // Cupom
  couponCode?: string;
  couponId?: string;
  couponDiscountApplied?: number;
  couponError?: string;

  // Leva e traz
  needsPickup?: boolean;
  needsReturn?: boolean;
  pickupAddress?: string;
  pickupDistanceKm?: number;
  pickupFee?: number;
  pickupAddressAttempts?: number;

  // Lembrete customizado
  reminderPreference?: "30min" | "1hour" | "1day" | "none";

  // Comprovante de pagamento
  pixPaymentType?: "now" | "delivery";
  receiptImageUrl?: string;
  receiptAmount?: number;
  receiptValidationAttempts?: number;
  partialPayments?: Array<{ amount: number; imageUrl: string }>;
  totalPaid?: number;

  // Bônus de primeira compra
  isFirstTimeCustomer?: boolean;
  firstTimeBonusApplied?: boolean;
  firstTimeBonusDiscount?: number;

  // Tracking de inatividade
  lastInteractionAt?: number;

  // Cliente recorrente e fidelidade
  isReturningClient?: boolean;
  savedVehicle?: string | null;
  loyaltyPoints?: number;
  loyaltyDiscountApplied?: number;

  // Controle de fluxo
  awaitingReceiptUpload?: boolean;
  awaitingDiscountResponse?: boolean;
  awaitingPickupAddress?: boolean;
  awaitingReturnPreference?: boolean;
  awaitingServiceRecommendation?: boolean;
  serviceRecommendation?: string | null;

  // Oferta de desconto (cancelamento)
  discountOffer?: {
    originalPrice: number;
    discountPercentage: number;
    validUntil: string;
    used: boolean;
    discountReason?: string;
  };
  discountOriginalPrice?: number;
  awaitingServiceQuestion?: boolean;

  // Pagamento
  paymentGateway?: string;
  transactionId?: string;
  paidAt?: string;
  paymentSimulationCode?: string;
}


