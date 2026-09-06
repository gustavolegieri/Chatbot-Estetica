/** Sem interação por 1 hora → atendimento reinicia na próxima mensagem. */
export const SESSION_RESET_MS = 60 * 60 * 1000;

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
  /** Proposta em tres degraus: resolve, recomendado, completo. */
  | "ETAPA_PROPOSTA"
  /** Complementos que cabem na mesma visita. */
  | "ETAPA_EXTRAS"
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
  vehiclePlate?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  vehicleCondition?: string;
  vehicleIsSuv?: boolean;
  /** Coleta em duas etapas: modelo → ano */
  vehicleCollectStep?: "details" | "model" | "year" | "color" | "condition";
  vehicleConfirmed?: boolean;
  reminderEnabled?: boolean;
  quoteMin?: number;
  quoteMax?: number;
  /**
   * Define se quoteMin/quoteMax ainda representam o valor cheio. Estados
   * antigos sem essa marca já continham o desconto no preço e continuam
   * compatíveis como "discounted".
   */
  quoteDiscountMode?: "base" | "discounted";
  estimatedTime?: string;
  upsellLabel?: string;
  upsellAccepted?: boolean;
  upsellOffered?: boolean;
  upsellValue?: number;
  /** Duração real do complemento aceito, para não encurtar a reserva. */
  upsellDurationMin?: number;
  availableSlots?: string[];
  /**
   * Opções da última lista enviada nas etapas de agendamento (semanas, dias,
   * períodos ou horários), na ordem em que apareceram.
   *
   * O id de cada linha não é um número — é a data, a semana ou a hora. Guardar
   * a ordem permite que o cliente que digita "2" em vez de tocar caia na mesma
   * opção, e que a lista continue funcionando como texto numerado em provedores
   * sem menu interativo.
   */
  pickerOptions?: Array<{ id: string; label: string }>;
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
  /** Intenção entendida antes de o cliente informar o nome. */
  pendingInitialIntent?: "schedule" | "service" | "doubt";
  /** Serviço citado na primeira mensagem, preservado durante a identificação. */
  pendingServiceKey?: string;
  /** Confirma, em um único bloco, os dados extraídos da primeira mensagem. */
  awaitingInitialRequestConfirmation?: boolean;
  /** Cliente pediu para corrigir algum item do resumo inicial. */
  awaitingInitialRequestCorrection?: boolean;
  /** Preferência de período entendida na conversa, antes da escolha do horário. */
  requestedTimePreference?: "morning" | "afternoon" | "evening";
  /** Contexto livre usado para tornar a apresentação do serviço mais natural. */
  serviceRequestContext?: string;
  /** Inteligência transversal usada pelo WhatsApp, PWA e CRM. */
  aiIntelligence?: import("./conversation-intelligence").ConversationIntelligence;
  /** Variante estável usada para medir conversão da abertura do atendimento. */
  abWelcomeVariant?: "A" | "B";
  /** Aguarda nota pós-atendimento enviada automaticamente pelo gestor de reputação. */
  awaitingPostServiceRating?: boolean;

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
  /** Cupom interno que deu origem ao bônus de primeira compra, se houver. */
  firstTimeBonusCouponId?: string;

  // Tracking de inatividade
  lastInteractionAt?: number;

  // Cliente recorrente e fidelidade
  isReturningClient?: boolean;
  savedVehicle?: string | null;
  savedVehiclePlate?: string | null;
  /** Aguarda a decisão de reutilizar o veículo salvo no CRM. */
  awaitingSavedVehicleChoice?: boolean;
  /** Após uma reserva, aguarda uma nova mensagem antes de iniciar outro atendimento. */
  awaitingPostConfirmationReturn?: boolean;
  /** Oferta de repetição pendente de resposta (caminho rápido do recorrente). */
  repeatOffer?: unknown;
  /** Reserva já feita; falta só a placa para o reconhecimento no portão. */
  awaitingPlateAfterBooking?: boolean;
  /** Cancelamento de uma reserva existente, aguardando o sim do cliente. */
  /** Complementos oferecidos, na ordem mostrada. */
  extrasOptions?: Array<{ key: string; label: string; price: number; durationMin: number }>;
  /** Complementos aceitos pelo cliente. */
  extrasChosen?: Array<{ key: string; label: string; price: number; durationMin: number }>;
  /** Ja passou pela etapa de complementos. */
  extrasDone?: boolean;
  /** Ja escolheu um degrau da proposta: nao mostrar de novo. */
  proposalChosen?: boolean;
  /** Degraus mostrados na proposta, na ordem em que o cliente os viu. */
  proposalOptions?: Array<{
    key: string;
    label: string;
    price: number;
    durationMin: number;
    upsellKey?: string;
    upsellLabel?: string;
  }>;
  awaitingCancelConfirmation?: boolean;
  cancelAppointmentId?: string;
  /** Reserva que será substituída quando o novo horário for confirmado. */
  rescheduleAppointmentId?: string;
  /** Na retomada, pergunta se o atendimento será para o mesmo veículo. */
  awaitingReturningVehicleChoice?: boolean;
  loyaltyPoints?: number;
  loyaltyDiscountApplied?: number;

  // Controle de fluxo
  awaitingReceiptUpload?: boolean;
  awaitingDiscountResponse?: boolean;
  awaitingPickupAddress?: boolean;
  awaitingReturnPreference?: boolean;
  awaitingServiceRecommendation?: boolean;
  serviceRecommendation?: string | null;
  /** Chave validada do catálogo sugerida pela IA; nunca aceita texto livre. */
  serviceRecommendationKey?: string | null;
  /** Opções exibidas após uma resposta contextual da IA. */
  awaitingAiFollowup?: boolean;
  aiFollowupReturnStage?: FlowStage;

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

/**
 * Data para o cliente ler. Quando o dia é escolhido pela lista do calendário,
 * `dayLabel` guarda só o nome do dia ("Segunda-feira") — e o resumo e a
 * confirmação saíam sem dizer *qual* segunda. Este helper junta o dia da semana
 * com a data real sempre que `dayDate` (YYYY-MM-DD) estiver preenchido.
 */
export function customerDayDisplay(flow: {
  dayLabel?: string | null;
  dayDate?: string | null;
}): string | null {
  const label = flow.dayLabel?.trim() || null;
  const iso = flow.dayDate?.trim() || null;
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return label;

  const [year, month, day] = iso.split("-").map(Number);
  const curta = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  if (!label) return curta;
  // `dateLabel` já produz "07/09 (segunda-feira)"; não duplica a data.
  if (label.includes(curta)) return label;
  return `${label}, ${curta}`;
}
