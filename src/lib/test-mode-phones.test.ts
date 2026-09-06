import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTestModePhones,
  parseTestModePhones,
  testModeAllowsPhone,
} from "./test-mode-phones";

test("um número só continua valendo, sem migração", () => {
  assert.deepEqual(parseTestModePhones("5511944400696"), ["5511944400696"]);
  assert.equal(testModeAllowsPhone("+55 11 94440-0696", true, "5511944400696"), true);
});

test("vários números separados por vírgula liberam todos", () => {
  const configurado = "5511944400696, 5511972851072";
  assert.deepEqual(parseTestModePhones(configurado), ["5511944400696", "5511972851072"]);
  assert.equal(testModeAllowsPhone("5511944400696", true, configurado), true);
  assert.equal(testModeAllowsPhone("5511972851072", true, configurado), true);
  assert.equal(testModeAllowsPhone("5511999999999", true, configurado), false);
});

test("ponto e vírgula, quebra de linha e repetição são tolerados", () => {
  assert.deepEqual(parseTestModePhones("5511944400696;\n5511944400696\n5511972851072"), [
    "5511944400696",
    "5511972851072",
  ]);
});

test("modo de teste desligado libera qualquer número", () => {
  assert.equal(testModeAllowsPhone("5511999999999", false, "5511944400696"), true);
});

test("modo de teste ligado sem telefone não libera ninguém", () => {
  // Sem esta trava, um campo vazio abriria o bot para todo mundo justamente
  // quando o operador achava que estava em teste.
  assert.equal(testModeAllowsPhone("5511944400696", true, ""), false);
  assert.equal(testModeAllowsPhone("5511944400696", true, null), false);
});

test("números curtos demais são descartados", () => {
  assert.deepEqual(parseTestModePhones("123, 5511972851072"), ["5511972851072"]);
  assert.equal(formatTestModePhones(" 5511944400696 , 5511972851072 "), "5511944400696,5511972851072");
});
