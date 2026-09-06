import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ROW_TITLE,
  fitButtonLabel,
  fitRowTitles,
  shortenLabel,
  visualLength,
} from "./whatsapp-list-text";

test("o que cabe passa intacto", () => {
  assert.equal(shortenLabel("Lavagem Simples"), "Lavagem Simples");
  assert.equal(shortenLabel("💧 Lavagem & cuidado externo"), "💧 Lavagem & cuidado externo");
});

test("as palavras de ligação saem antes das letras", () => {
  assert.equal(shortenLabel("Higienização dos Bancos de Tecido"), "Higienização Bancos Tecido");
});

test("o parêntese que distingue o serviço é preservado", () => {
  // "… (Tecido)" e "… (Couro)" chegavam com o mesmo título cortado; o que
  // diferencia os dois não pode ser justamente o que some.
  const tecido = shortenLabel("Higienização dos Bancos, Teto e Carpete (Tecido)");
  const couro = shortenLabel("Higienização dos Bancos, Teto e Carpete (Couro)");
  assert.match(tecido, /\(Tecido\)$/);
  assert.match(couro, /\(Couro\)$/);
  assert.notEqual(tecido, couro);
});

test("a palavra repetida no começo da lista sai de todas as linhas", () => {
  const titulos = fitRowTitles([
    "Higienização dos Bancos de Tecido",
    "Higienização dos Bancos, Teto e Carpete (Tecido)",
    "Higienização Bancos de Couro",
    "Higienização dos Bancos, Teto e Carpete (Couro)",
  ]);

  // A categoria já está no cabeçalho da lista: repeti-la em cada linha gastava
  // o espaço que o nome do serviço precisava.
  for (const titulo of titulos) {
    assert.doesNotMatch(titulo, /^Higienização/);
    assert.ok(visualLength(titulo) <= MAX_ROW_TITLE, `passou do limite: ${titulo}`);
    assert.doesNotMatch(titulo, /…/, `ficou cortado: ${titulo}`);
  }
  assert.equal(new Set(titulos).size, titulos.length, "as linhas precisam ser distintas");
});

test("a linha que não compartilha a palavra fica como está", () => {
  const titulos = fitRowTitles([
    "Higienização dos Bancos de Tecido",
    "Higienização dos Bancos, Teto e Carpete (Tecido)",
    "Voltar ao menu principal",
  ]);
  assert.equal(titulos[2], "Voltar ao menu principal");
});

test("nenhuma linha é encurtada quando todas já cabem", () => {
  const labels = ["Lavagem Simples", "Lavagem Completa", "Voltar ao menu principal"];
  assert.deepEqual(fitRowTitles(labels), labels);
});

test("o rótulo de botão respeita o limite mais apertado", () => {
  assert.equal(visualLength(fitButtonLabel("Confirmar reserva")), 17);
  assert.ok(visualLength(fitButtonLabel("Alterar forma de pagamento")) <= 20);
});
