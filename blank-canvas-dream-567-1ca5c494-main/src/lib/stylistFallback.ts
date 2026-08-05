// Local intelligent fallback for the Stylist chat — used when the network
// or the edge function is unreachable. Never returns an "unavailable" message.

export interface StylistContext {
  body_type?: string;
  palette?: string;
  style?: string;
  budget?: string;
}

export function localStylistFallback(message: string, ctx: StylistContext = {}): string {
  const m = message.toLowerCase();
  const palette = ctx.palette ?? 'sua paleta';
  const style = (ctx.style ?? 'seu estilo').toLowerCase();
  const bodyType = (ctx.body_type ?? 'seu biotipo').toLowerCase();

  if (/\b(frio|inverno|gelad)/.test(m)) {
    return `Para clima frio mantendo ${style}:\n\n• Sobreposição com trench coat ou casaco de lã em tom neutro da ${palette}\n• Tricot fino de gola alta por baixo\n• Calça reta ou alfaiataria com bota cano médio\n• Acessórios: cachecol de lã e bolsa estruturada\n\nQuer que eu ajuste para um evento específico?`;
  }
  if (/\b(quent|calor|verão|verao)/.test(m)) {
    return `Para clima quente:\n\n• Vestido fluido ou conjunto de linho em tom claro da ${palette}\n• Sandália plana ou rasteira de couro\n• Bolsa de palha ou tecido leve\n• Acessório: óculos statement\n\nQuer versão mais formal ou casual?`;
  }
  if (/\b(social|elegante|formal|trabalho|evento)/.test(m)) {
    return `Versão mais elegante:\n\n• Blazer alfaiataria estruturado em tom escuro\n• Camisa de seda ou top de cetim\n• Calça reta de cintura alta ou saia midi\n• Scarpin ou mule de salto médio\n• Bolsa estruturada pequena\n\nIdeal para reunião, jantar ou evento corporativo. Quer ajustar?`;
  }
  if (/\b(casual|dia|passeio|relax)/.test(m)) {
    return `Versão mais casual:\n\n• Camiseta de algodão premium + jeans reto\n• Tênis branco minimalista ou loafer\n• Sobreposição leve (camisa aberta ou cardigan)\n• Bolsa transversal\n\nMantém a essência ${style} sem perder conforto.`;
  }
  if (/\b(sapato|calçad|tenis|bota|sandalia|scarpin|mule)/.test(m)) {
    return `Sugestões de calçado para ${bodyType}:\n\n• Dia/casual: tênis branco minimalista ou loafer de couro\n• Trabalho: mule de salto bloco médio\n• Noite: scarpin nude ou sandália de tira fina\n• Inverno: bota cano médio em couro\n\nMe diga a ocasião que eu refino.`;
  }
  if (/\b(barat|econ|preço|preco|acessív)/.test(m)) {
    return `Versão mais acessível mantendo qualidade visual:\n\n• Priorize: Renner, C&A, Amazon Moda, Shopee curada\n• Foque em peças-curinga (camisa branca, calça reta preta, blazer neutro)\n• Invista no calçado e bolsa — elevam qualquer look\n\nQuer lista por categoria?`;
  }

  return `Pensando no seu ${bodyType} e na paleta ${palette}:\n\n• Comece pela peça âncora (a que define o look)\n• Combine com tons da mesma família cromática\n• Acrescente uma textura contrastante (couro, cetim, tricot)\n• Finalize com um acessório statement\n\nMe conta a ocasião específica e eu monto a sugestão completa.`;
}
