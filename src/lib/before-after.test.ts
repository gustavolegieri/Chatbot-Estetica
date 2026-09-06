import assert from "node:assert/strict";
import test from "node:test";
import { BEFORE_AFTER_SIZE, beforeAfterLayout, fitHeadline } from "./before-after";

test("beforeAfterLayout fecha exatamente a altura do quadro", () => {
  const layout = beforeAfterLayout();
  assert.equal(
    layout.headerHeight + layout.panelHeight * 2 + layout.gap + layout.footerHeight,
    BEFORE_AFTER_SIZE
  );
});

test("beforeAfterLayout posiciona os painéis sem sobreposição", () => {
  const layout = beforeAfterLayout();
  assert.equal(layout.beforeTop, layout.headerHeight);
  assert.equal(layout.afterTop, layout.beforeTop + layout.panelHeight + layout.gap);
  assert.ok(layout.afterTop + layout.panelHeight <= BEFORE_AFTER_SIZE);
});

test("beforeAfterLayout continua fechando em outros tamanhos", () => {
  for (const size of [720, 1080, 1440]) {
    const layout = beforeAfterLayout(size);
    assert.equal(
      layout.headerHeight + layout.panelHeight * 2 + layout.gap + layout.footerHeight,
      size,
      `tamanho ${size}`
    );
    assert.ok(layout.panelHeight > 0, `tamanho ${size}`);
  }
});

test("fitHeadline preserva títulos curtos e normaliza espaços", () => {
  assert.equal(fitHeadline("  Civic   ·  Polimento "), "Civic · Polimento");
});

test("fitHeadline trunca títulos longos com reticências", () => {
  const result = fitHeadline("Chevrolet Onix Plus Premier · Polimento técnico completo", 20);
  assert.equal(result.length, 20);
  assert.ok(result.endsWith("…"));
});
