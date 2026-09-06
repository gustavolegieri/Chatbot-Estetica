/**
 * Converte as mensagens numeradas do fluxo em listas e botões nativos.
 *
 * Todo o texto do bot já segue a convenção `*1* — Opção`. Em vez de reescrever
 * cada etapa para chamar `sendList`, este módulo lê essa convenção e monta a
 * mensagem interativa a partir do texto pronto. Assim as mensagens continuam as
 * mesmas (e continuam editáveis pelo painel de prompts), mas chegam ao cliente
 * como menu tocável quando o provedor suporta — hoje, a Wafly.
 *
 * O id de cada opção é o próprio número, que é o que as etapas já esperam
 * receber: a resposta do menu volta pelo webhook como se o cliente tivesse
 * digitado o número.
 */

import {
  MAX_BUTTONS,
  MAX_LIST_ROWS,
  fitButtonLabel,
  fitRowDescription,
  fitRowTitles,
  shortenLabel,
} from "./whatsapp-list-text";
import {
  providerSupportsButtons,
  providerSupportsLists,
  type ProviderButton,
  type ProviderListOption,
} from "./whatsapp-provider";

export {
  MAX_BUTTONS,
  MAX_LIST_ROWS,
  MAX_ROW_DESCRIPTION,
  MAX_ROW_TITLE,
  shortenLabel,
} from "./whatsapp-list-text";

export type InteractiveOption = {
  id: string;
  title: string;
  description?: string;
  /** Rótulo como estava no texto, sem corte — usado para remontar a linha. */
  label: string;
};

export type ParsedInteractiveMessage = {
  /** Texto sem as linhas de opção — vira o corpo da mensagem interativa. */
  body: string;
  options: InteractiveOption[];
};

/** Marcador de início de opção: `*1*`, `*1* —`, `*1* -`. */
const OPTION_MARKER = /\*(\d{1,2})\*\s*(?:[—–-]\s*)?/g;

export function interactiveMenusEnabled(): boolean {
  return process.env.WHATSAPP_INTERACTIVE_MENUS !== "false";
}

/**
 * Separa o rótulo em título e descrição. Rótulos do menu principal vêm no
 * formato `💧 Lavagem & cuidado externo — a partir de R$ 55`: a parte após o
 * travessão é exatamente o que cabe na descrição da linha.
 */
function splitLabel(label: string): { title: string; description?: string } {
  const partes = label.split(/\s+[—–]\s+/);
  const nome = partes[0].trim();
  const complemento = partes.slice(1).join(" — ").trim() || undefined;

  const title = shortenLabel(nome);
  // Quando o nome precisou encolher, o nome completo vai para a descrição —
  // assim nenhuma informação some da tela, mesmo com o título curto.
  const description =
    title === nome
      ? complemento
      : complemento
        ? `${nome} · ${complemento}`
        : nome;

  return {
    title: title || "Opção",
    description: description ? fitRowDescription(description) : undefined,
  };
}

/**
 * Extrai as opções de uma linha. Aceita a linha de duas colunas usada nos
 * horários (`*1* — 08:00   •   *9* — 13:00`), em que uma linha traz duas
 * opções.
 */
function optionsInLine(line: string): InteractiveOption[] | null {
  const marcadores = [...line.matchAll(OPTION_MARKER)];
  if (marcadores.length === 0) return null;
  // A linha precisa começar pela opção; senão é texto comum que cita um número.
  if (line.slice(0, marcadores[0].index ?? 0).trim() !== "") return null;

  const opcoes: InteractiveOption[] = [];
  for (let i = 0; i < marcadores.length; i++) {
    const atual = marcadores[i];
    const inicio = (atual.index ?? 0) + atual[0].length;
    const fim = i + 1 < marcadores.length ? marcadores[i + 1].index : line.length;
    const rotulo = line
      .slice(inicio, fim)
      .replace(/[•·|]+\s*$/, "")
      .trim();
    if (!rotulo) continue;
    opcoes.push({ id: atual[1], label: rotulo, ...splitLabel(rotulo) });
  }
  return opcoes.length ? opcoes : null;
}

/**
 * Lê o texto pronto e devolve o corpo sem as opções mais a lista de opções.
 * Opções repetidas (o mesmo número duas vezes) invalidam a leitura: é sinal de
 * que o texto não é um menu, e nesse caso ele segue como texto puro.
 */
export function parseNumberedOptions(text: string): ParsedInteractiveMessage {
  const linhas = text.split(/\r?\n/);
  const restante: string[] = [];
  const opcoes: InteractiveOption[] = [];
  const vistos = new Set<string>();
  let duplicado = false;

  for (const linha of linhas) {
    const encontradas = optionsInLine(linha);
    if (!encontradas) {
      restante.push(linha);
      continue;
    }
    for (const opcao of encontradas) {
      if (vistos.has(opcao.id)) duplicado = true;
      vistos.add(opcao.id);
      opcoes.push(opcao);
    }
  }

  if (duplicado || opcoes.length < 2) {
    return { body: text, options: [] };
  }

  return { body: tidy(restante.join("\n")), options: opcoes };
}

/** Remove as linhas em branco que sobraram no lugar das opções. */
function tidy(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .trim();
}

/**
 * Reconstrói as linhas numeradas a partir das opções lidas.
 *
 * Serve para as mensagens com mídia: a legenda de uma imagem não pode ser
 * interativa, então o resumo vai na legenda e as opções seguem logo depois em
 * uma mensagem própria, que aí sim vira lista ou botão.
 */
export function renderOptionLines(options: InteractiveOption[]): string {
  return options.map((o) => `*${o.id}* ${o.label}`).join("\n");
}

export type InteractiveDelivery =
  | { kind: "text" }
  | {
      kind: "list";
      body: string;
      options: ProviderListOption[];
      listTitle: string;
      listButtonLabel: string;
      /** Aviso acrescentado quando a lista não coube inteira. */
      truncated: boolean;
    }
  | { kind: "buttons"; body: string; buttons: ProviderButton[] };

/**
 * Decide como a mensagem deve ser entregue. `kind: "text"` significa manter o
 * comportamento atual — é o que acontece com qualquer provedor sem suporte
 * interativo e com qualquer mensagem que não seja um menu.
 */
export function planInteractiveDelivery(
  text: string,
  options?: { listTitle?: string; listButtonLabel?: string }
): InteractiveDelivery {
  if (!interactiveMenusEnabled()) return { kind: "text" };

  const suportaLista = providerSupportsLists();
  const suportaBotoes = providerSupportsButtons();
  if (!suportaLista && !suportaBotoes) return { kind: "text" };

  const { body, options: opcoes } = parseNumberedOptions(text);
  if (!opcoes.length || !body) return { kind: "text" };

  // Botão é melhor para uma decisão curta ("Confirmar" / "Alterar"), mas o
  // rótulo dele é bem mais apertado que o de uma linha de lista. Quando algum
  // rótulo não cabe sem corte, a lista ganha: um nome de serviço truncado no
  // botão ("Lavagem Técnica…") é pior que uma lista com o nome inteiro.
  const botoes = opcoes.map((o) => ({ id: o.id, label: fitButtonLabel(o.label), type: "reply" as const }));
  const cabeNoBotao = botoes.every((b) => !b.label.endsWith("…"));

  if (opcoes.length <= MAX_BUTTONS && suportaBotoes && (cabeNoBotao || !suportaLista)) {
    return { kind: "buttons", body, buttons: botoes };
  }

  if (!suportaLista) return { kind: "text" };

  const cabem = opcoes.slice(0, MAX_LIST_ROWS);
  // Os títulos são encurtados olhando a lista inteira: o que todas as linhas
  // repetem no começo sai, e sobra espaço para o que distingue cada uma.
  const titulos = fitRowTitles(cabem.map((o) => o.label.split(/\s+[—–]\s+/)[0]));
  return {
    kind: "list",
    body,
    options: cabem.map((o, i) => ({
      id: o.id,
      title: titulos[i],
      description:
        titulos[i] === o.label.split(/\s+[—–]\s+/)[0].trim()
          ? o.description
          : fitRowDescription(o.label),
    })),
    listTitle: options?.listTitle ?? "Opções",
    listButtonLabel: options?.listButtonLabel ?? "Ver opções",
    truncated: opcoes.length > cabem.length,
  };
}
