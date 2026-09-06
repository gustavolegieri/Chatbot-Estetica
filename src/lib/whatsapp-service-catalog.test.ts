import assert from "node:assert/strict";
import test from "node:test";
import type { Service } from "@prisma/client";
import { resolveServiceCategoryNum } from "./service-category";
import {
  buildCategoriesFromServices,
  buildMainMenu,
  categoryFromMenuNumber,
  mainMenuEntries,
} from "./whatsapp-service-catalog";
import { CATEGORIES } from "./whatsapp-catalog";
import { getDefaultPromptMap } from "./bot-prompts";

function service(partial: Partial<Service>): Service {
  return {
    active: true,
    showInWhatsApp: true,
    menuOrder: 0,
    categoryNum: null,
    catalogKey: null,
    name: "Serviço",
    description: null,
    ...partial,
  } as Service;
}

test("catálogo do banco não esconde os serviços oficiais da mesma categoria", () => {
  // Regressão: com um único serviço cadastrado na categoria 1, o menu passava a
  // mostrar só ele e sumia com Lavagem Completa e Detalhada do fluxo oficial.
  const categories = buildCategoriesFromServices(
    [service({ catalogKey: "lavagem_simples", categoryNum: 1, name: "Lavagem Simples" })],
    getDefaultPromptMap()
  );

  for (const key of CATEGORIES[1].keys) {
    assert.ok(categories[1].keys.includes(key), `categoria 1 deveria conter ${key}`);
  }
});

test("serviço desativado no painel não volta pelo catálogo estático", () => {
  const categories = buildCategoriesFromServices(
    [service({ catalogKey: "lavagem_simples", categoryNum: 1, name: "Lavagem Simples" })],
    getDefaultPromptMap(),
    new Set(["lavagem_detalhada"])
  );

  assert.ok(categories[1].keys.includes("lavagem_completa"));
  assert.ok(!categories[1].keys.includes("lavagem_detalhada"));
});

test("cadastro que move a chave de categoria não a duplica na categoria oficial", () => {
  const categories = buildCategoriesFromServices(
    [service({ catalogKey: "lavagem_detalhada", categoryNum: 5, name: "Lavagem Detalhada" })],
    getDefaultPromptMap()
  );

  assert.ok(!categories[1].keys.includes("lavagem_detalhada"));
  assert.ok(categories[5].keys.includes("lavagem_detalhada"));
});

test("cada categoria lista suas chaves sem repetição", () => {
  const categories = buildCategoriesFromServices(
    [service({ catalogKey: "lavagem_simples", categoryNum: 1, name: "Lavagem Simples" })],
    getDefaultPromptMap()
  );

  for (const cat of Object.values(categories)) {
    assert.equal(new Set(cat.keys).size, cat.keys.length);
  }
});

test("resolveServiceCategoryNum infers the right category from names and catalog keys", () => {
  assert.equal(
    resolveServiceCategoryNum({ categoryNum: null, catalogKey: null, name: "Polimento", description: null }),
    2
  );

  assert.equal(
    resolveServiceCategoryNum({ categoryNum: null, catalogKey: null, name: "Cristalização de Farol", description: null }),
    3
  );

  assert.equal(
    resolveServiceCategoryNum({ categoryNum: null, catalogKey: null, name: "Higienização Interna Couro", description: null }),
    4
  );

  assert.equal(
    resolveServiceCategoryNum({ categoryNum: null, catalogKey: null, name: "Detalhamento Completo", description: null }),
    6
  );
});

test("menu principal não pula número quando uma categoria está vazia", () => {
  // A categoria 6 ("Revitalização") não tem serviço próprio: numerar pela
  // categoria fazia a lista pular do *5* para o *7* e sobrava a impressão de
  // opção quebrada. O número mostrado passa a ser a posição na lista.
  const categories = buildCategoriesFromServices([], getDefaultPromptMap());
  const entradas = mainMenuEntries(categories);

  assert.deepEqual(
    entradas.map((entrada) => entrada.display),
    entradas.map((_, indice) => indice + 1)
  );
  assert.ok(!entradas.some((entrada) => entrada.categoryNum === 6));

  const menu = buildMainMenu(categories, getDefaultPromptMap());
  assert.match(menu, /\*6\* 📦/);
  assert.match(menu, /\*9\* 👤 Falar com atendente/);
});

test("o número tocado pelo cliente volta para a categoria certa", () => {
  const categories = buildCategoriesFromServices([], getDefaultPromptMap());
  // Sem a categoria 6, "6" no aparelho é a de pacotes (7) e "7" é a ajuda (8).
  assert.equal(categoryFromMenuNumber(categories, 1), 1);
  assert.equal(categoryFromMenuNumber(categories, 5), 5);
  assert.equal(categoryFromMenuNumber(categories, 6), 7);
  assert.equal(categoryFromMenuNumber(categories, 7), 8);
  assert.equal(categoryFromMenuNumber(categories, 8), null);
});
