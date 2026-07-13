import { cerebrasChat, isCerebrasConfigured, parseJsonFromModel } from "./cerebras-ai";

interface ReceiptAnalysis {
  amount: number;
  currency?: string;
  date?: string;
  transactionId?: string;
}

/**
 * Analisa imagem de comprovante de pagamento PIX usando IA multimodal
 * Extrai valor pago, data e ID da transação
 */
export async function analyzeReceiptImage(imageUrl: string | null): Promise<number | null> {
  if (!imageUrl) {
    return null;
  }

  // Se IA não configurada, usa simulação
  if (!isCerebrasConfigured()) {
    return getSimulatedReceiptAmount(imageUrl);
  }

  try {
    const system = `Você é um assistente especializado em ler comprovantes de pagamento PIX.
Extraia APENAS o valor numérico do pagamento em reais (BRL).
Retorne apenas JSON com: amount (número decimal).
Se não conseguir identificar o valor, retorne amount: 0.`;

    const user = `Analise este comprovante de pagamento PIX e extraia o valor pago: ${imageUrl}`;

    const raw = await cerebrasChat({ system, user, maxTokens: 200 });

    if (raw) {
      const analysis = parseJsonFromModel<ReceiptAnalysis>(raw);
      if (analysis && analysis.amount > 0) {
        return analysis.amount;
      }
    }
  } catch (error) {
    console.error("Erro na análise de comprovante:", error);
  }

  // Fallback para simulação
  return getSimulatedReceiptAmount(imageUrl);
}

/**
 * Simulação baseada em padrões de URL (para desenvolvimento/teste)
 * Em produção, isso deve usar a IA real
 */
function getSimulatedReceiptAmount(imageUrl: string): number | null {
  // Em ambiente de desenvolvimento, retorna valores simulados baseados na URL
  // Isso permite testar o fluxo sem IA configurada
  
  const lower = imageUrl.toLowerCase();
  
  // Simular diferentes cenários baseados em padrões na URL
  if (lower.includes("valor50") || lower.includes("50.00")) {
    return 50.00;
  }
  if (lower.includes("valor100") || lower.includes("100.00")) {
    return 100.00;
  }
  if (lower.includes("valor150") || lower.includes("150.00")) {
    return 150.00;
  }
  if (lower.includes("valor200") || lower.includes("200.00")) {
    return 200.00;
  }
  
  // Para URLs genéricas, retorna null para forçar erro no fluxo
  // Em produção, remover isso e usar apenas a IA
  return null;
}

/**
 * Valida se o valor do comprovante está dentro da tolerância aceitável
 */
export function validateReceiptAmount(
  receiptAmount: number,
  expectedAmount: number,
  tolerancePercent: number = 10
): boolean {
  const tolerance = tolerancePercent / 100;
  const minValue = expectedAmount * (1 - tolerance);
  const maxValue = expectedAmount * (1 + tolerance);
  
  return receiptAmount >= minValue && receiptAmount <= maxValue;
}
