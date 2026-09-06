import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNumberedOptions,
  planInteractiveDelivery,
  renderOptionLines,
  shortenLabel,
} from "./whatsapp-interactive";

const LF = String.fromCharCode(10);

function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const MENU_PRINCIPAL = [
  "Olá, *Gustavo*. Qual cuidado seu veículo precisa hoje?",
  "",
  "*1* 💧 Lavagem & cuidado externo — a partir de R$ 55",
  "*2* ✨ Polimento & correção — a partir de R$ 300",
  "*3* 🛡️ Proteção de pintura — a partir de R$ 95",
  "*4* 🪑 Higienização interna — a partir de R$ 85",
  "*9* 👤 Falar com atendente",
  "",
  "_A qualquer momento, envie *menu* para recomeçar._",
].join("\n");

test("o menu numerado vira opções com o número como id", () => {
  const { body, options } = parseNumberedOptions(MENU_PRINCIPAL);
  assert.equal(options.length, 5);
  assert.deepEqual(
    options.map((o) => o.id),
    ["1", "2", "3", "4", "9"]
  );
  // O que vem depois do travessão cabe na descrição da linha.
  assert.deepEqual(options[0], {
    id: "1",
    label: "💧 Lavagem & cuidado externo — a partir de R$ 55",
    title: "💧 Lavagem & cuidado externo",
    description: "a partir de R$ 55",
  });
  assert.deepEqual(options[4], {
    id: "9",
    label: "👤 Falar com atendente",
    title: "👤 Falar com atendente",
    description: undefined,
  });
  // O corpo perde as opções e mantém a abertura e o rodapé.
  assert.match(body, /Qual cuidado seu veículo precisa hoje/);
  assert.match(body, /envie \*menu\* para recomeçar/);
  assert.doesNotMatch(body, /Falar com atendente/);
});

test("o nome longo continua legível: título curto e nome inteiro na descrição", () => {
  const { options } = parseNumberedOptions(
    ["Qual opção?", "*1* — Descontaminação de Pintura e Aplicação de Cera Nobre", "*2* — Limpeza Premium"].join("\n")
  );
  assert.equal(options[0].title.length <= 24, true);
  assert.match(options[0].description ?? "", /Descontaminação de Pintura/);
  assert.equal(options[1].title, "Limpeza Premium");
});

test("a linha de horários em duas colunas vira duas opções", () => {
  const { options } = parseNumberedOptions(
    ["*Horários*", "*1* — 08:00   •   *5* — 13:00", "*2* — 09:00   •   *6* — 14:00"].join("\n")
  );
  assert.deepEqual(
    options.map((o) => `${o.id}:${o.title}`),
    ["1:08:00", "5:13:00", "2:09:00", "6:14:00"]
  );
});

test("texto que apenas cita números não vira menu", () => {
  const texto = "O serviço leva *2* horas e custa *R$ 55*. Podemos agendar?";
  assert.deepEqual(parseNumberedOptions(texto), { body: texto, options: [] });
});

test("números repetidos indicam que não é menu", () => {
  const texto = ["*1* — Primeira", "*1* — Repetida"].join("\n");
  assert.deepEqual(parseNumberedOptions(texto).options, []);
});

test("sem provedor interativo a mensagem segue como texto", () => {
  comEnv({ WHATSAPP_PROVIDER: "wasender" }, () => {
    assert.deepEqual(planInteractiveDelivery(MENU_PRINCIPAL), { kind: "text" });
  });
});

test("com a Wafly o menu longo vira lista e o curto vira botões", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly", WHATSAPP_INTERACTIVE_MENUS: undefined }, () => {
    const lista = planInteractiveDelivery(MENU_PRINCIPAL, { listTitle: "Serviços" });
    assert.equal(lista.kind, "list");
    if (lista.kind !== "list") return;
    assert.equal(lista.options.length, 5);
    assert.equal(lista.listTitle, "Serviços");
    assert.equal(lista.truncated, false);

    const botoes = planInteractiveDelivery(
      ["Confirma a reserva?", "*1* ✅ Confirmar", "*2* ❌ Alterar"].join("\n")
    );
    assert.equal(botoes.kind, "buttons");
    if (botoes.kind !== "buttons") return;
    assert.deepEqual(
      botoes.buttons.map((b) => b.id),
      ["1", "2"]
    );
  });
});

test("lista maior que o limite do WhatsApp é cortada e marcada", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly" }, () => {
    const linhas = Array.from({ length: 16 }, (_, i) => `*${i + 1}* — ${8 + i}:00`);
    const plano = planInteractiveDelivery(["Horários:", ...linhas].join("\n"));
    assert.equal(plano.kind, "list");
    if (plano.kind !== "list") return;
    assert.equal(plano.options.length, 12);
    assert.equal(plano.truncated, true);
  });
});

test("a chave de desligamento devolve o texto original", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly", WHATSAPP_INTERACTIVE_MENUS: "false" }, () => {
    assert.deepEqual(planInteractiveDelivery(MENU_PRINCIPAL), { kind: "text" });
  });
});

test("as linhas remontadas usam o rotulo original, sem corte", () => {
  const { options } = parseNumberedOptions(
    ["Como deseja seguir?", "*1* Confirmar reserva", "*2* Alterar data ou horario"].join(LF)
  );
  assert.equal(
    renderOptionLines(options),
    ["*1* Confirmar reserva", "*2* Alterar data ou horario"].join(LF)
  );
});

test("o rotulo longo perde as palavras de ligacao antes de perder letras", () => {
  // O aparelho corta o titulo por volta de 30 caracteres: "Higienizacao dos
  // Bancos de Tecido" chegava como "Higienizacao dos Ban...".
  assert.equal(shortenLabel("Higienização dos Bancos de Tecido"), "Higienização Bancos Tecido");
  assert.equal(shortenLabel("Lavagem Simples"), "Lavagem Simples");
  // Quando nem sem conectivos cabe, sobra o corte — e o nome inteiro vai para
  // a descricao da linha.
  const gigante = shortenLabel("Descontaminação de Pintura e Aplicação de Cera Nobre");
  assert.ok([...gigante].length <= 28);
  assert.match(gigante, /…$/);
});
