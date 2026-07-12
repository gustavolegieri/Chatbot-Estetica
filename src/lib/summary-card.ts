import { generateCalendarImage } from "./calendar-core";

interface SummaryCardData {
  customerName: string;
  serviceName: string;
  vehicle: string;
  date: string;
  time: string;
  paymentMethod: string;
  totalPrice: number;
  pickupAddress?: string;
}

/**
 * Gera imagem visual do resumo do agendamento.
 * Reaproveita o pipeline de geração de imagem do calendário.
 */
export async function generateSummaryCard(data: SummaryCardData): Promise<string> {
  // Por enquanto, usar placeholder enquanto integra com canvas
  // TODO: Implementar geração real com canvas similar ao calendário
  
  const placeholder = `https://placehold.co/600x400/1a1a2e/FFD700?text=Resumo+do+Agendamento&font=playfair-display`;
  
  return placeholder;
}

/**
 * Retorna o texto formatado do resumo (para caso a imagem falhar ou como fallback).
 */
export function generateSummaryText(data: SummaryCardData): string {
  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **RESUMO DO AGENDAMENTO**",
    "",
    `👤 Cliente: ${data.customerName}`,
    `🧽 Serviço: ${data.serviceName}`,
    `🚘 Veículo: ${data.vehicle}`,
    `📅 Data: ${data.date}`,
    `⏰ Horário: ${data.time}`,
    data.pickupAddress ? `📍 Busca: ${data.pickupAddress}` : "",
    `💳 Pagamento: ${data.paymentMethod}`,
    `💰 Total: R$ ${data.totalPrice.toFixed(2).replace('.', ',')}`,
    "━━━━━━━━━━━━━━━",
    "",
    "✅ Confirma? (sim/não)",
  ];
  
  return lines.filter(Boolean).join("\n");
}
