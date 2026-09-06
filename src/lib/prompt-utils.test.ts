import assert from "node:assert/strict";
import test from "node:test";
import { toWhatsAppMarkdown } from "./prompt-utils";

test("converte negrito do Markdown para o formato do WhatsApp", () => {
  assert.equal(
    toWhatsAppMarkdown("A **Lavagem Completa** inclui cera."),
    "A *Lavagem Completa* inclui cera."
  );
  assert.equal(toWhatsAppMarkdown("__Polimento__ técnico"), "*Polimento* técnico");
  assert.equal(toWhatsAppMarkdown("***muito***"), "*muito*");
});

test("preserva o negrito que já está no formato do WhatsApp", () => {
  const texto = "A *Lavagem Completa* custa *R$ 75*.";
  assert.equal(toWhatsAppMarkdown(texto), texto);
});

test("converte títulos e listas do Markdown", () => {
  assert.equal(toWhatsAppMarkdown("## Serviços"), "*Serviços*");
  assert.equal(
    toWhatsAppMarkdown("- Lavagem\n- Polimento"),
    "• Lavagem\n• Polimento"
  );
  assert.equal(toWhatsAppMarkdown("* Cera"), "• Cera");
});

test("remove espaços de fim de linha e excesso de linhas em branco", () => {
  assert.equal(toWhatsAppMarkdown("linha um   \n\n\n\nlinha dois"), "linha um\n\nlinha dois");
});

test("não estraga asteriscos soltos nem multiplicação", () => {
  assert.equal(toWhatsAppMarkdown("2 * 3 = 6"), "2 * 3 = 6");
  assert.equal(toWhatsAppMarkdown("valor**"), "valor**");
});

test("é idempotente", () => {
  const uma = toWhatsAppMarkdown("**Oi**\n- um\n- dois");
  assert.equal(toWhatsAppMarkdown(uma), uma);
});
