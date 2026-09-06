import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OPCOES,
  formatRepeatOffer,
  ordenarPorPreferencia,
  parseRepeatChoice,
  slotLabel,
  type RepeatOffer,
} from "./whatsapp-repeat-offer";

const HOJE = new Date(2026, 8, 4); // sexta, 04/09/2026

function oferta(overrides: Partial<RepeatOffer> = {}): RepeatOffer {
  return {
    serviceId: "srv1",
    serviceName: "Lavagem Completa",
    serviceDurationMin: 90,
    servicePrice: 75,
    vehicleLabel: "Fiesta 2012 · FEG4B58",
    vehicleModel: "Fiesta 2012",
    vehiclePlate: "FEG4B58",
    lastVisitAt: new Date(2026, 7, 1),
    slots: [
      { date: "2026-09-05", time: "09:00", label: "sábado, 05/09" },
      { date: "2026-09-08", time: "14:00", label: "terça, 08/09" },
      { date: "2026-09-09", time: "08:00", label: "quarta, 09/09" },
    ],
    ...overrides,
  };
}

test("slotLabel usa hoje/amanhã quando faz sentido", () => {
  assert.equal(slotLabel("2026-09-04", HOJE), "hoje, 04/09");
  assert.equal(slotLabel("2026-09-05", HOJE), "amanhã, 05/09");
  assert.equal(slotLabel("2026-09-08", HOJE), "terça, 08/09");
});

test("ordenarPorPreferencia aproxima do horário da última visita", () => {
  const slots = ["08:00", "10:00", "14:00", "17:00"];
  assert.deepEqual(ordenarPorPreferencia(slots, "14:30").slice(0, 2), ["14:00", "17:00"]);
  assert.deepEqual(ordenarPorPreferencia(slots, "08:10")[0], "08:00");
});

test("ordenarPorPreferencia devolve a lista original sem horário de referência", () => {
  const slots = ["08:00", "10:00"];
  assert.deepEqual(ordenarPorPreferencia(slots, null), slots);
  assert.deepEqual(ordenarPorPreferencia(slots, "invalido"), slots);
});

test("a oferta mostra serviço, veículo, preço e no máximo três horários", () => {
  const texto = formatRepeatOffer(oferta(), "Gustavo");
  assert.match(texto, /Gustavo/);
  assert.match(texto, /Lavagem Completa/);
  assert.match(texto, /Fiesta 2012/);
  assert.match(texto, /R\$ 75,00/);
  assert.equal((texto.match(/^\*\d\* 📅/gm) ?? []).length, MAX_OPCOES);
  // Formatação do WhatsApp: nunca negrito de Markdown.
  assert.ok(!texto.includes("**"));
});

test("parseRepeatChoice entende os números dos horários", () => {
  const o = oferta();
  assert.deepEqual(parseRepeatChoice("1", o), { kind: "slot", slot: o.slots[0] });
  assert.deepEqual(parseRepeatChoice("3", o), { kind: "slot", slot: o.slots[2] });
});

test("parseRepeatChoice entende as saídas", () => {
  const o = oferta();
  assert.equal(parseRepeatChoice("4", o).kind, "other-service");
  assert.equal(parseRepeatChoice("outro serviço", o).kind, "other-service");
  assert.equal(parseRepeatChoice("5", o).kind, "other-time");
  assert.equal(parseRepeatChoice("outro horário", o).kind, "other-time");
});

test("um 'sim' solto assume o horário mais próximo", () => {
  const o = oferta();
  assert.deepEqual(parseRepeatChoice("sim", o), { kind: "slot", slot: o.slots[0] });
});

test("não inventa escolha para um número fora da oferta", () => {
  const o = oferta({ slots: [{ date: "2026-09-05", time: "09:00", label: "sábado, 05/09" }] });
  assert.equal(parseRepeatChoice("2", o).kind, "unknown");
  assert.equal(parseRepeatChoice("qualquer coisa", o).kind, "unknown");
});
