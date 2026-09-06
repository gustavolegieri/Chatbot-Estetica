import assert from "node:assert/strict";
import test from "node:test";
import { buildMainMenu, categoryStartingPrice } from "./whatsapp-service-catalog";
import { CATALOG, CATEGORIES } from "./whatsapp-catalog";
import { getDefaultPromptMap } from "./bot-prompts";

const categorias = Object.fromEntries(
  Object.entries(CATEGORIES).map(([num, cat]) => [Number(num), { title: cat.title, keys: cat.keys }])
) as Record<number, { title: string; keys: string[] }>;

test("categoryStartingPrice usa o menor preço com valor cadastrado", () => {
  assert.equal(categoryStartingPrice(["lavagem_simples", "lavagem_completa"], CATALOG), 55);
});

test("categoryStartingPrice ignora itens sem preço", () => {
  assert.equal(categoryStartingPrice(["indeciso"], CATALOG), null);
  assert.equal(categoryStartingPrice([], CATALOG), null);
});

test("o menu mostra o preço inicial de cada categoria", () => {
  const menu = buildMainMenu(categorias, getDefaultPromptMap(), CATALOG);
  assert.match(menu, /a partir de R\$ 55/);
  assert.match(menu, /\*9\* 👤 Falar com atendente/);
});

test("sem o catálogo o menu continua funcionando, só sem preço", () => {
  const menu = buildMainMenu(categorias, getDefaultPromptMap());
  assert.ok(!menu.includes("a partir de"));
  assert.match(menu, /\*1\*/);
});

test("o Polimento deixou de ser 'sob consulta' sem número", () => {
  const polimento = CATALOG.polimento_cotacao;
  assert.ok(polimento.hatchMin > 0, "polimento precisa de preço mínimo");
  assert.ok(polimento.suvMin >= polimento.hatchMin, "SUV não pode custar menos que hatch");
  assert.ok(polimento.hatchMax >= polimento.hatchMin);
});
