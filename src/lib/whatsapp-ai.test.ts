import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeQuestion } from "./whatsapp-ai";
import { detectServiceKey } from "./whatsapp-intent";

test("looksLikeQuestion recognizes customer doubts even without a question mark", () => {
  assert.equal(looksLikeQuestion("Quanto custa o polimento"), true);
  assert.equal(looksLikeQuestion("valor do polimento"), true);
  assert.equal(looksLikeQuestion("vocês lavam motor também"), true);
  assert.equal(looksLikeQuestion("tempo de duração da vitrificação"), true);
  assert.equal(looksLikeQuestion("quero saber como funciona a vitrificação"), true);
  assert.equal(looksLikeQuestion("me fale os detalhes da higienização"), true);
  assert.equal(looksLikeQuestion("preciso saber quais formas de pagamento aceitam"), true);
  assert.equal(looksLikeQuestion("pix?"), true);
  assert.equal(looksLikeQuestion("tem horário hoje?"), true);
});

test("looksLikeQuestion does not turn ordinary flow answers into doubts", () => {
  assert.equal(looksLikeQuestion("Gustavo"), false);
  assert.equal(looksLikeQuestion("quero agendar"), false);
  assert.equal(looksLikeQuestion("Honda Fit 2020 branco"), false);
  assert.equal(looksLikeQuestion("sim"), false);
});

test("routes vitrification to premium packages instead of decontamination", () => {
  assert.equal(detectServiceKey("quero fazer vitrificação cerâmica"), "pacotes");
});
