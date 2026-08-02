/**
 * Validação segura de comprovantes.
 *
 * O endpoint de chat atualmente usado pela aplicação recebe apenas texto; ele
 * não recebe os bytes da imagem anexada pelo WhatsApp. Portanto, pedir que um
 * modelo "leia" uma URL de imagem não é uma verificação de pagamento: o
 * modelo poderia inferir ou inventar um valor. Também não é seguro deduzir
 * valores a partir do nome/URL de um arquivo.
 *
 * Até existir uma integração de OCR/PSP confiável que entregue a imagem ou a
 * transação verificável ao servidor, a análise automática fica deliberadamente
 * indisponível. O fluxo mantém o comprovante pendente para conferência humana
 * e nunca confirma um pagamento com base em uma simulação.
 */
export async function analyzeReceiptImage(_imageUrl: string | null): Promise<number | null> {
  return null;
}

/**
 * Valida se um valor *já verificado por uma fonte confiável* está dentro da
 * tolerância aceitável. Esta função não transforma OCR, URL ou texto livre em
 * comprovação de pagamento.
 */
export function validateReceiptAmount(
  receiptAmount: number,
  expectedAmount: number,
  tolerancePercent: number = 10
): boolean {
  if (!Number.isFinite(receiptAmount) || !Number.isFinite(expectedAmount)) {
    return false;
  }

  const tolerance = tolerancePercent / 100;
  const minValue = expectedAmount * (1 - tolerance);
  const maxValue = expectedAmount * (1 + tolerance);

  return receiptAmount >= minValue && receiptAmount <= maxValue;
}
