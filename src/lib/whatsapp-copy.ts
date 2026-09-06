/**
 * Texto do atendimento, separado da lógica de estado.
 *
 * O fluxo decide *quando* falar; este módulo decide *como*. Quem for ajustar
 * uma frase mexe só aqui, sem entrar na máquina de estados — e quem for mexer
 * numa transição não precisa reler parágrafos de copy.
 *
 * As mensagens das etapas principais continuam em `bot_prompts` (editáveis pelo
 * painel). Aqui ficam as de apoio, que não têm tela de edição: reorientação,
 * ajuda, cancelamento, remarcação e os avisos de operação demorada.
 *
 * Régua da voz: uma ideia por mensagem, frase curta, tom próximo e confiante,
 * emoji só quando substitui uma palavra, e sempre uma ação óbvia no fim.
 */

/** Reorientação depois de uma entrada que o fluxo não entendeu. */
export const naoEntendi = {
  /** Primeira tentativa: repete a pergunta com um exemplo. */
  comExemplo: (pergunta: string, exemplo: string) =>
    `${pergunta}\n\n_Exemplo: ${exemplo}_`,

  /** Segunda tentativa seguida: oferece a saída humana. */
  ofereceAtendente: (pergunta: string) =>
    `${pergunta}\n\nSe preferir, responda *9* e um especialista assume a conversa.`,

  /** Menu numerado que voltou vazio ou fora do intervalo. */
  opcaoInvalida: (opcoes: string) =>
    `Não achei essa opção 🤔\n\n${opcoes}\n\n_Responda com o número, ou escreva o que precisa._`,
};

/** Comandos que valem em qualquer etapa. */
export const ajuda = {
  menu: "Pode escrever *menu* a qualquer momento para recomeçar.",
  comandos: [
    "Aqui vão os atalhos:",
    "",
    "*menu* — recomeça do início",
    "*meus agendamentos* — mostra suas reservas",
    "*remarcar* — troca a data de uma reserva",
    "*cancelar* — desmarca uma reserva",
    "*9* — fala com um especialista",
  ].join("\n"),
};

/** Cancelamento e remarcação de uma reserva existente. */
export const reserva = {
  confirmarCancelamento: (servico: string, quando: string) =>
    [
      `Você tem *${servico}* marcado para ${quando}.`,
      "",
      "Confirma o cancelamento?",
      "",
      "*1* ✅ Sim, cancelar",
      "*2* 📅 Manter o horário",
      "",
      "_Se preferir apenas trocar o dia, responda *remarcar*._",
    ].join("\n"),

  cancelada: (quando: string) =>
    [
      `Pronto. Seu horário de *${quando}* foi cancelado, sem custo.`,
      "",
      "Quando quiser remarcar, é só me chamar — envie *menu* para ver os serviços.",
    ].join("\n"),

  mantida: "Combinado, seu horário continua confirmado 😊 Te espero no dia!",

  remarcando: (servico: string, quando: string) =>
    [
      `Vamos remarcar seu atendimento de *${servico}*, marcado para ${quando}.`,
      "",
      "O horário atual fica reservado até você confirmar o novo.",
    ].join("\n"),

  semVaga:
    "Não encontrei vagas nas próximas semanas para essa combinação. Responda *9* que a equipe encaixa você.",
};

/**
 * Aviso de operação demorada.
 *
 * Vale para o que depende de renderizar imagem nova ou consultar a agenda
 * inteira. Só aparece quando a espera passa do que o cliente tolera calado.
 */
export const processando = {
  montandoProposta: "Deixa eu montar as opções para o seu carro… ⏳",
  buscandoAgenda: "Consultando a agenda… ⏳",
};

/** Mensagens do pós-atendimento. */
export const posAtendimento = {
  semReservas:
    "Você não tem agendamentos ativos no momento. Quer ver os serviços? Envie *menu*.",

  listaDeReservas: (linhas: string[]) =>
    [
      "Seus próximos atendimentos:",
      "━━━━━━━━━━━━━━━",
      ...linhas,
      "",
      "_Para trocar a data, escreva *remarcar*. Para desmarcar, *cancelar*._",
    ].join("\n"),
};
