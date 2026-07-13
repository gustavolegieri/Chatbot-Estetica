/**
 * Detector de Intenção de Cancelamento com Oferta de Desconto
 * Detecta quando cliente quer cancelar e oferece desconto para reter
 */

import { prisma } from "./prisma";
import { botLogger } from "./structured-logger";

export interface CancellationOffer {
  discountPercentage: number;
  discountReason: string;
  validForMinutes: number;
}

/**
 * Padrões de intenção de cancelamento
 */
const CANCELLATION_PATTERNS = [
  /cancelar|cancel|não quero|desistir|vou desistir|não vou|sem interesse/i,
  /mudei de ideia|me arrependi|pensando melhor|nao faz mais/i,
  /muito caro|caro demais|preço alto|expensive|não tenho dinheiro/i,
  /em outro lugar|outra loja|outro lugar|outro estúdio/i,
  /vou procurar|vou ver outras opções|ver com outro/i,
];

/**
 * Detecta intenção de cancelamento
 */
export function detectCancellationIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return CANCELLATION_PATTERNS.some(pattern => pattern.test(lower));
}

/**
 * Detecta motivo do cancelamento
 */
export function detectCancellationReason(message: string): string {
  const lower = message.toLowerCase();

  if (/caro|preço|dinheiro|grana/i.test(lower)) {
    return "PRECO";
  }
  if (/mudei de ideia|arrependi|pensando melhor/i.test(lower)) {
    return "INDECISAO";
  }
  if (/outro lugar|outra loja|outro estúdio/i.test(lower)) {
    return "CONCORRENCIA";
  }
  if (/não tem tempo|sem tempo|atrasado|demora/i.test(lower)) {
    return "TEMPO";
  }
  if (/outro serviço|serviço diferente|quer outro/i.test(lower)) {
    return "SERVICO";
  }

  return "DESCONHECIDO";
}

/**
 * Calcula desconto baseado no motivo
 */
export function calculateDiscount(reason: string, originalPrice: number): CancellationOffer {
  let discountPercentage = 0;
  let discountReason = "";

  switch (reason) {
    case "PRECO":
      discountPercentage = 15; // 15% de desconto para reclamações de preço
      discountReason = "Gostaríamos muito de ter você como cliente, oferecemos 15% de desconto!";
      break;
    case "INDECISAO":
      discountPercentage = 10; // 10% para indecisão
      discountReason = "Vamos te dar um incentivo: 10% de desconto para tomar sua decisão!";
      break;
    case "CONCORRENCIA":
      discountPercentage = 20; // 20% para concorrência
      discountReason = "Valorizamos muito sua preferência: 20% de desconto exclusivo!";
      break;
    case "TEMPO":
      discountPercentage = 5; // 5% para problemas de tempo
      discountReason = "Entendemos que seu tempo é valioso: 5% de desconto pela espera!";
      break;
    case "SERVICO":
      discountPercentage = 0; // Sem desconto, oferecer outro serviço
      discountReason = "Podemos oferecer um serviço diferente que se adapta melhor às suas necessidades.";
      break;
    default:
      discountPercentage = 10; // 10% padrão
      discountReason = "Oferecemos 10% de desconto para você reconsiderar!";
  }

  return {
    discountPercentage,
    discountReason,
    validForMinutes: 30, // Oferta válida por 30 minutos
  };
}

/**
 * Gera mensagem de oferta de desconto
 */
export function generateDiscountOfferMessage(
  customerName: string,
  originalPrice: number,
  offer: CancellationOffer
): string {
  const discountedPrice = originalPrice * (1 - offer.discountPercentage / 100);
  const savings = originalPrice - discountedPrice;

  const lines: string[] = [];
  lines.push(`🎁 ${customerName}, não vá embora!`);
  lines.push("");
  lines.push(offer.discountReason);
  lines.push("");
  lines.push(`💰 Preço original: R$ ${originalPrice.toFixed(2).replace('.', ',')}`);
  lines.push(`✨ Preço com desconto: R$ ${discountedPrice.toFixed(2).replace('.', ',')}`);
  lines.push(`💚 Você economiza: R$ ${savings.toFixed(2).replace('.', ',')}`);
  lines.push("");
  lines.push(`⏰ Oferta válida por ${offer.validForMinutes} minutos`);
  lines.push("");
  lines.push("Quer aproveitar esta oferta?");
  lines.push("Responda:");
  lines.push("1 - Sim, aproveitar o desconto");
  lines.push("2 - Não, prefiro cancelar mesmo assim");

  return lines.join("\n");
}

/**
 * Registra oferta de desconto no banco
 */
export async function saveDiscountOffer(
  sessionId: string,
  phone: string,
  originalPrice: number,
  discountPercentage: number,
  validUntil: Date
) {
  try {
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone },
    });

    if (!session) {
      botLogger.error("Sessão não encontrada para salvar oferta", undefined, { sessionId, phone });
      return null;
    }

    await prisma.whatsAppSession.update({
      where: { phone },
      data: {
        metadata: {
          ...(session.metadata as any),
          discountOffer: {
            originalPrice,
            discountPercentage,
            validUntil: validUntil.toISOString(),
            used: false,
          },
        },
      },
    });

    botLogger.info("Oferta de desconto salva", { sessionId, phone, discountPercentage });
    return { success: true };
  } catch (error) {
    botLogger.error("Erro ao salvar oferta de desconto", error as Error, { sessionId, phone });
    return { success: false };
  }
}

/**
 * Verifica se oferta de desconto ainda é válida
 */
export function isDiscountOfferValid(discountOffer: any): boolean {
  if (!discountOffer || discountOffer.used) {
    return false;
  }

  const validUntil = new Date(discountOffer.validUntil);
  return new Date() < validUntil;
}
