/** Sem interação por 30 min → atendimento reinicia (cron + próxima mensagem) */
export const SESSION_RESET_MS = 30 * 60 * 1000;

export type FlowStage =
  | "ETAPA1_AWAITING_NAME"
  | "ETAPA2_CLIENT_RECOGNITION"  // NOVO: reconhecimento de cliente recorrente
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
  | "ETAPA3_UPSELL"
  | "ETAPA7_PERIOD"
  | "ETAPA7_DAY"
  | "ETAPA7_TIME"
  | "ETAPA7_CUSTOM_DAY"
  | "ETAPA8_PAYMENT"
  | "ETAPA8_PAYMENT_NO_PIX"
  | "ETAPA8_PAYMENT_CARD_TYPE"
  | "ETAPA8_PHOTO"
  | "ETAPA8_PHOTO_UPLOAD"  // NOVO: upload de foto (unificado)
  | "ETAPA9_COUPON"
  | "ETAPA9_LOYALTY"  // NOVO: pontos de fidelidade
  | "ETAPA9_PICKUP"
  | "ETAPA9_PICKUP_ADDRESS"
  | "ETAPA9_RETURN_PREFERENCE"
  | "ETAPA9_REMINDER"
  | "ETAPA10_BUDGET"
  | "ETAPA10_LOGISTICS"  // NOVO: logística combinada (substitui ETAPA9_PICKUP*)
  | "ETAPA10_CONFIRM"  // NOVO: confirmação final (unificado)
  | "ETAPA11_RATING"  // NOVO: avaliação pós-atendimento
  | "ETAPA11_SERVICE_QUESTION"  // NOVO: recomendação de serviço
  | "ETAPA14_REMINDER"
  | "ETAPA15_SUMMARY_CONFIRM"
  | "ETAPA16_CONFIRMATION"  // NOVO: confirmação final após resumo
  | "ETAPA10_FAQ"
  | "ETAPA8_PIX_CHOICE"
  | "ETAPA8_RECEIPT_UPLOAD"
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
  vehiclePhotoAttached?: boolean;
  reminderEnabled?: boolean;
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

  // Cupom
  couponCode?: string;
  couponId?: string;
  couponDiscountApplied?: number; // valor descontado (R$)
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
  pixPaymentType?: "now" | "delivery"; // PIX agora ou na entrega
  receiptImageUrl?: string;
  receiptAmount?: number;
  receiptValidationAttempts?: number;
  partialPayments?: Array<{ amount: number; imageUrl: string }>; // Rastrear pagamentos parciais
  totalPaid?: number; // Total já pago

  // Bônus de primeira compra
  isFirstTimeCustomer?: boolean;
  firstTimeBonusApplied?: boolean;
  firstTimeBonusDiscount?: number; // valor do desconto (R$)

  // NOVOS CAMPOS DO TEST-BOT
  // Tracking de inatividade
  lastInteractionAt?: number;

  // Foto do veículo
  vehiclePhotoUrl?: string | null;

  // Cliente recorrente e fidelidade
  isReturningClient?: boolean;
  savedVehicle?: string | null;
  loyaltyPoints?: number;
  loyaltyDiscountApplied?: number; // Valor do desconto aplicado via pontos (R$)

  // Controle de fluxo
  awaitingReceiptUpload?: boolean;
  awaitingDiscountResponse?: boolean;
  awaitingPickupAddress?: boolean;
  awaitingReturnPreference?: boolean;
  awaitingPhotoUpload?: boolean;
  awaitingServiceRecommendation?: boolean;
  serviceRecommendation?: string | null;
  awaitingServiceQuestion?: boolean;

  // Detecção de cancelamento
  discountOriginalPrice?: number;
  discountOffer?: {
    originalPrice: number;
    discountPercentage: number;
    validUntil: string;
    used: boolean;
    discountReason?: string;
  };

  // Pagamento (campos adicionais do test-bot)
  paymentGateway?: string;
  transactionId?: string;
  paidAt?: string; // ISO string para persistência
  paymentSimulationCode?: string; // Apenas para test-bot

  // Upsell (valor monetário)
  upsellValue?: number;
}


