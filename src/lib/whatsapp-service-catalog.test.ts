import assert from "node:assert/strict";
import test from "node:test";
import { resolveServiceCategoryNum } from "./service-category";

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
