// ================================================================
// SHARED PIECE KEY GENERATOR
// ----------------------------------------------------------------
// Esta é a ÚNICA fonte de verdade para a chave usada em
// `clothing_images.piece_key` e `clothing_images.normalized_key`
// dentro do fluxo de peças individuais (useAutoImage → search-clothing-image).
//
// A mesma lógica de normalização precisa existir em:
//   • src/hooks/useAutoImage.ts             (produz o pieceKey enviado)
//   • src/hooks/useDiagnosisImages.ts       (lê o pieceKey do banco)
//   • src/pages/DiagnosisResult.tsx         (hasPieceImage/getPieceImage)
//   • supabase/functions/search-clothing-image/index.ts
//        → função `normalizeClientPieceKey` (cópia byte-a-byte)
//
// Regras:
//   1. A chave é derivada SOMENTE do nome PT-BR original da peça.
//      Nada de tradução EN, categoria, cor ou seed — porque essas
//      variáveis mudam ao longo do pipeline (Cerebras/tradução/AI
//      re-scoring) e provocariam divergência entre a versão web e o
//      snapshot do PDF.
//   2. `normalizeToken` = lowercase + NFD + strip diacríticos + trim +
//      colapsa qualquer coisa que não seja [a-z0-9] em `_`.
//   3. Nunca altere sem alterar as duas outras cópias no mesmo commit.
// ================================================================

export function normalizeToken(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Chave canônica para uma peça, derivada exclusivamente do nome PT-BR. */
export function computePieceKey(pieceName: string | null | undefined): string {
  return normalizeToken(pieceName);
}
