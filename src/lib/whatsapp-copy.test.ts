import assert from "node:assert/strict";
import test from "node:test";
import { naoEntendi, pareceRabisco, reserva } from "./whatsapp-copy";

test("rabisco de teclado é reconhecido sem consultar IA", () => {
  for (const texto of ["asdkjhaskjd", "kkkjjhh", "zxcvbn", "qwerty"]) {
    assert.equal(pareceRabisco(texto), true, texto);
  }
});

test("palavra de verdade nunca é tratada como rabisco", () => {
  for (const texto of [
    "oi",
    "menu",
    "polimento",
    "cancelar",
    "quanto custa",
    "1",
    "Fiesta 2012",
    "obrigado",
  ]) {
    assert.equal(pareceRabisco(texto), false, texto);
  }
});

test("a reorientação repete o menu em vez de reiniciar o fluxo", () => {
  const texto = naoEntendi.opcaoInvalida("*1* Lavagem\n*2* Polimento");
  assert.match(texto, /\*1\* Lavagem/);
  assert.match(texto, /responda com o n[úu]mero/i);
});

test("o cancelamento pergunta antes de desmarcar", () => {
  const texto = reserva.confirmarCancelamento("Lavagem Completa", "*07/09* às *08:00*");
  assert.match(texto, /Confirma o cancelamento\?/);
  assert.match(texto, /\*1\* ✅ Sim, cancelar/);
  assert.match(texto, /\*2\* 📅 Manter o horário/);
  assert.match(texto, /remarcar/);
});
