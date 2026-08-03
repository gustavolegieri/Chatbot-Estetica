import test from "node:test";
import assert from "node:assert/strict";
import { generateCalendarLegend } from "./calendar-helper";
import { etapa5Quote, etapa7Time } from "./whatsapp-flow-messages";

test("equal quote values render as a single price without a duplicated range", () => {
  const text = etapa5Quote(
    "Gustavo",
    "Honda Fit 2020",
    "Lavagem Simples",
    55,
    55,
    "60 min",
    "Ideal para manutenção rápida do veículo.",
  );

  assert.match(text, /R\$ 55/);
  assert.doesNotMatch(text, /R\$ 55 a R\$ 55/);
  assert.doesNotMatch(text, /Proposta inicial/i);
  assert.doesNotMatch(text, /Como deseja seguir/i);
});

test("calendar copy stays short and time message renders the full dynamic day", () => {
  const legend = generateCalendarLegend();
  assert.match(legend, /Escolha o melhor dia no calendário/i);
  assert.doesNotMatch(legend, /Segunda-feira|Terça-feira|Quarta-feira/);

  const slots = Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
  const timeMessage = etapa7Time("16/08/2027 (segunda-feira)", slots, "1h");
  assert.match(timeMessage, /08:00/);
  assert.match(timeMessage, /23:00/);
  assert.equal((timeMessage.match(/— \d{2}:00/g) ?? []).length, 16);
});
