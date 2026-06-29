import type { FlowStage } from "./whatsapp-flow-types";

export const FLOW_STAGE_LABELS: Record<string, string> = {
  ETAPA1_AWAITING_NAME: "Aguardando nome",
  ETAPA2_MAIN_MENU: "Menu principal",
  ETAPA2_SUB: "Submenu de serviço",
  ETAPA3_SERVICE_ACTION: "Detalhe do serviço",
  ETAPA3_UNDECIDED_VEHICLE: "Indeciso — veículo",
  ETAPA3_UNDECIDED_PROBLEM: "Indeciso — problema",
  ETAPA3_PACKAGE_ACTION: "Pacotes",
  ETAPA4_VEHICLE: "Coleta de veículo",
  ETAPA5_QUOTE: "Orçamento",
  ETAPA6_UPSELL: "Upsell",
  ETAPA7_PERIOD: "Período",
  ETAPA7_DAY: "Escolha de dia",
  ETAPA7_TIME: "Escolha de horário",
  ETAPA7_CUSTOM_DAY: "Dia personalizado",
  ETAPA8_PAYMENT: "Pagamento",
  ETAPA8_PAYMENT_NO_PIX: "Pagamento (sem PIX)",
  ETAPA10_FAQ: "Dúvidas (FAQ)",
  STALE_RETURN: "Retorno após pausa",
  HANDOFF: "Atendimento humano",
};

export function flowStageLabel(stage?: string | FlowStage | null): string {
  if (!stage) return "—";
  return FLOW_STAGE_LABELS[stage] ?? stage.replace(/_/g, " ").toLowerCase();
}
