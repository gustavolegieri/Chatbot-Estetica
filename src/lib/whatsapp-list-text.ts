/**
 * Texto das linhas de lista e dos botões do WhatsApp.
 *
 * Este módulo existe para que o corte aconteça **uma vez só**. Antes, o fluxo
 * encurtava o rótulo, o `sendList` cortava de novo e o adaptador do provedor
 * cortava mais uma vez em 24 caracteres — o resultado chegava ao cliente com
 * palavras partidas no meio, mesmo quando o nome caberia inteiro.
 *
 * Não importa nada: é o módulo de baixo da pilha, usado tanto pelo adaptador de
 * provedor quanto pela camada que monta os menus.
 *
 * Os limites são medidos no aparelho, não tirados da documentação. Testes com a
 * instância real da Wafly:
 *  - 12 linhas renderizaram normalmente (o limite de 10 da documentação do
 *    WhatsApp não vale aqui);
 *  - título de 28 caracteres apareceu inteiro; o de 34 apareceu cortado;
 *  - `optionList.sections` (lista agrupada) não chega ao aparelho — só a lista
 *    plana. É por isso que "por semana, depois por dia" são etapas de lista.
 */

/** Máximo de linhas por lista. */
export const MAX_LIST_ROWS = 12;
/** Máximo de botões por mensagem. */
export const MAX_BUTTONS = 3;
/** Máximo de caracteres visíveis no título de uma linha. */
export const MAX_ROW_TITLE = 28;
/** Máximo de caracteres visíveis na descrição de uma linha. */
export const MAX_ROW_DESCRIPTION = 72;
/** Máximo de caracteres visíveis no rótulo de um botão. */
export const MAX_BUTTON_LABEL = 20;

/** Palavras de ligação que podem sair do título sem prejudicar a leitura. */
const CONECTIVOS = /\s+(?:de|da|do|das|dos|e|com|para|em|no|na|nos|nas|a|o|os|as)\s+/gi;

/** Comprimento visível: um emoji conta como um caractere, não como dois. */
export function visualLength(value: string): number {
  return [...value].length;
}

/** Corta preservando a última palavra inteira sempre que possível. */
export function truncate(value: string, max: number): string {
  const limpo = value.trim();
  if (visualLength(limpo) <= max) return limpo;
  const corte = [...limpo].slice(0, max - 1).join("");
  const espaco = corte.lastIndexOf(" ");
  const base = espaco > max * 0.6 ? corte.slice(0, espaco) : corte;
  return `${base.trimEnd()}…`;
}

/**
 * Encurta um rótulo até caber **sem reticências**, quando possível.
 *
 * "Higienização dos Bancos de Tecido" chegava ao aparelho como "Higienização
 * dos Ban…". Tirar as palavras de ligação resolve a maioria dos casos
 * ("Higienização Bancos Tecido") e mantém o nome legível. Só quando nem isso
 * basta é que sobra o corte — e aí o nome completo continua visível na
 * descrição da linha.
 */
export function shortenLabel(label: string, max = MAX_ROW_TITLE): string {
  const limpo = label.trim();
  if (visualLength(limpo) <= max) return limpo;

  // O parêntese final costuma ser justamente o que diferencia dois serviços
  // ("… (Tecido)" e "… (Couro)"). Ele é preservado inteiro e o encurtamento
  // recai sobre o começo do nome — sem isso, as duas linhas da lista chegavam
  // com o mesmo título cortado.
  const comParenteses = limpo.match(/^(.*\S)\s*(\([^()]{1,16}\))$/);
  if (comParenteses) {
    const cauda = comParenteses[2];
    const espacoDaCabeca = max - visualLength(cauda) - 1;
    if (espacoDaCabeca >= 8) {
      return `${encurtarNucleo(comParenteses[1], espacoDaCabeca)} ${cauda}`;
    }
  }

  return encurtarNucleo(limpo, max);
}

/** Tira ligação e pontuação; só corta letras quando não há outro jeito. */
function encurtarNucleo(label: string, max: number): string {
  const limpo = label.trim();
  if (visualLength(limpo) <= max) return limpo;

  const semConectivos = limpo.replace(CONECTIVOS, " ").replace(/\s{2,}/g, " ").trim();
  if (visualLength(semConectivos) <= max) return semConectivos;

  // Um ou dois caracteres de pontuação costumam ser a diferença entre o nome
  // inteiro e um nome cortado.
  const semPontuacao = semConectivos.replace(/[,;]/g, "").replace(/\s{2,}/g, " ").trim();
  if (visualLength(semPontuacao) <= max) return semPontuacao;

  return truncate(semPontuacao, max);
}

/** Título de linha pronto para o provedor. */
export function fitRowTitle(title: string): string {
  return shortenLabel(title, MAX_ROW_TITLE) || "Opção";
}

/**
 * Primeira palavra que todos os rótulos repetem, quando ela é longa o bastante
 * para valer a pena tirar.
 *
 * Só a primeira: tirar todo o trecho repetido ("Higienização dos Bancos, Teto
 * e") deixaria linhas como "Carpete (Tecido)", que perdem o sentido. Tirar a
 * palavra da categoria ("Higienização", já presente no cabeçalho da lista)
 * devolve espaço sem tirar significado.
 */
function palavraComum(labels: string[]): string | null {
  if (labels.length < 2) return null;
  const palavras = labels.map((l) => l.trim().split(/\s+/));
  const primeira = palavras[0][0];
  if (!primeira || visualLength(primeira) < 8) return null;
  const referencia = primeira.toLowerCase();
  // Cada rótulo precisa continuar com pelo menos duas palavras próprias.
  const todosTem = palavras.every((p) => p.length >= 3 && p[0].toLowerCase() === referencia);
  return todosTem ? primeira : null;
}

/**
 * Títulos de uma lista inteira, encurtados em conjunto.
 *
 * Encurtar rótulo a rótulo desperdiça o espaço da linha quando todos começam
 * igual: em "Higienização interna", as quatro linhas gastavam 12 caracteres
 * repetindo "Higienização" e sobrava "Higienização… (Tecido)". A categoria já
 * está no cabeçalho da lista, então a palavra repetida sai e o que distingue
 * cada serviço aparece inteiro.
 *
 * Se o corte fizer duas linhas ficarem com o mesmo título, a versão mais longa
 * volta para elas — duas linhas idênticas são piores que uma linha truncada.
 */
export function fitRowTitles(labels: string[]): string[] {
  const diretos = labels.map((l) => fitRowTitle(l));
  const naoCoube = labels.filter((l, i) => diretos[i] !== l.trim());
  if (naoCoube.length === 0) return diretos;

  // A palavra repetida é procurada entre as linhas que não couberam, mas sai de
  // todas as que a têm — metade da lista com a palavra e metade sem ficaria
  // desalinhada.
  const comum = palavraComum(naoCoube);
  if (!comum) return diretos;

  const curtos = labels.map((l, i) => {
    const palavras = l.trim().split(/\s+/);
    if (palavras[0].toLowerCase() !== comum.toLowerCase() || palavras.length < 3) {
      return diretos[i];
    }
    // Sem a palavra da categoria, a ligação que vinha depois dela ("dos", "de")
    // ficaria começando a linha.
    const resto = palavras.slice(1).join(" ").replace(/^(?:de|da|do|das|dos|com|e)\s+/i, "");
    return fitRowTitle(resto);
  });

  // Duas linhas com o mesmo título são piores que uma linha truncada.
  const repetidos = new Set(curtos.filter((titulo, i) => curtos.indexOf(titulo) !== i));
  return curtos.map((titulo, i) => (repetidos.has(titulo) ? diretos[i] : titulo));
}

/** Descrição de linha pronta para o provedor. */
export function fitRowDescription(description: string): string {
  return truncate(description, MAX_ROW_DESCRIPTION);
}

/** Rótulo de botão pronto para o provedor. */
export function fitButtonLabel(label: string): string {
  return shortenLabel(label, MAX_BUTTON_LABEL) || "Opção";
}
