// Utilities to centralize test-harness mappings and helpers
export const defaultInputMapping: Record<string, string> = {
  'null': 'Oi',
  'ETAPA1_AWAITING_NAME': 'João',
  'ETAPA2_MAIN_MENU': '1',
  'ETAPA2_SUB': '1',
  'ETAPA3_SERVICE_ACTION': '1',
  'ETAPA4_VEHICLE': 'Civic 2022',
  'ETAPA5_QUOTE': '1',
  'ETAPA6_UPSELL': '2',
  'ETAPA7_DAY': '1',
  'ETAPA7_TIME': '09:00',
  'ETAPA9_COUPON': 'pular',
  'ETAPA9_LOYALTY': 'não usar',
  'ETAPA10_BUDGET': 'sim',
  'ETAPA10_LOGISTICS': '1',
  'ETAPA8_PAYMENT': '1',
  'ETAPA8_PIX_CHOICE': '1',
  'ETAPA14_REMINDER': 'não',
  'ETAPA15_SUMMARY_CONFIRM': 'sim',
  'ETAPA3_UNDECIDED_VEHICLE': 'Civic 2022',
  'ETAPA3_UNDECIDED_PROBLEM': '1',
};

export const expectedTextsByStage: Record<string, string | string[]> = {
  'null': 'Seja muito bem-vindo',
  'ETAPA1_AWAITING_NAME': 'Seja muito bem-vindo',
  'ETAPA2_MAIN_MENU': 'O que seu carro precisa hoje',
  'ETAPA2_SUB': 'qual opção',
  'ETAPA3_SERVICE_ACTION': 'O que você quer fazer',
  'ETAPA4_VEHICLE': [
    'Qual o modelo do veículo',
    'Qual o ano do veículo',
    'Qual a cor do veículo',
    'Qual o estado geral do veículo',
    'Confirmando os dados do veículo',
    'Está certo? (sim/não)'
  ],
  'ETAPA5_QUOTE': ['Orçamento', 'Bônus'],
  'ETAPA6_UPSELL': 'adicionar',
  'ETAPA7_DAY': ['Dias para agendar', 'Digite o número do dia'],
  'ETAPA7_TIME': ['horários disponíveis', 'Digite o horário'],
  'ETAPA9_COUPON': 'cupom',
  'ETAPA9_LOYALTY': 'pontos',
  'ETAPA10_BUDGET': ['Vamos confirmar o agendamento', 'confirmar o agendamento'],
  'ETAPA10_LOGISTICS': 'Como prefere',
  'ETAPA8_PAYMENT': ['Pagar', 'PIX', 'Como deseja pagar', 'Combinado', 'levar o carro'],
  'ETAPA8_PIX_CHOICE': 'PIX',
  'ETAPA8_RECEIPT_UPLOAD': ['comprovante', 'PIX'],
  'ETAPA14_REMINDER': 'lembrete',
  'ETAPA15_SUMMARY_CONFIRM': 'resumo',
  'ETAPA16_CONFIRMATION': ['resumo', 'agendamento confirmado', 'agendamento confirmado!'],
  'ETAPA3_UNDECIDED_VEHICLE': 'O que está acontecendo',
  'ETAPA3_UNDECIDED_PROBLEM': 'recomendo',
};

export function getDefaultInput(stage: string, respostaBot: string, visitCount: Record<string, number>): string {
  // Increment handled by caller if desired
  const lower = (respostaBot || '').toLowerCase();

  if (stage === 'ETAPA4_VEHICLE') {
    if (lower.includes('confirmando') || lower.includes('está certo') || lower.includes('confirma')) return 'sim';
    if (lower.includes('modelo') && !lower.includes('confirmando')) return 'Civic 2022';
    if (lower.includes('cor') || lower.includes('qual a cor')) return 'prata';
    if (lower.includes('estado') || lower.includes('estado geral')) return 'bom';
    return defaultInputMapping['ETAPA4_VEHICLE'];
  }

  if (stage === 'ETAPA8_RECEIPT_UPLOAD') {
    return 'http://example.com/comprovante.jpg';
  }

  const firstVisit = (visitCount[stage] || 0) <= 1;
  if (firstVisit && defaultInputMapping[stage]) return defaultInputMapping[stage];

  return '1';
}

export function isAllowedTransition(stageAtual: string, flowStage: string | undefined): boolean {
  if (!flowStage) return true;
  if (stageAtual === 'ETAPA4_VEHICLE' && (flowStage === 'ETAPA4_VEHICLE' || flowStage === 'ETAPA5_QUOTE')) return true;
  if (stageAtual === 'ETAPA5_QUOTE' && (flowStage === 'ETAPA6_UPSELL' || flowStage === 'ETAPA7_DAY' || flowStage === 'ETAPA5_FIRST_TIME_BONUS')) return true;
  if (stageAtual === 'ETAPA7_TIME' && (flowStage === 'ETAPA9_COUPON' || flowStage === 'ETAPA10_BUDGET' || flowStage === 'ETAPA9_LOYALTY')) return true;
  return false;
}

export default {
  defaultInputMapping,
  expectedTextsByStage,
  getDefaultInput,
  isAllowedTransition,
};
