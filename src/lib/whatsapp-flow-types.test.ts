import assert from "node:assert/strict";
import test from "node:test";
import { customerDayDisplay } from "./whatsapp-flow-types";

test("junta o dia da semana com a data quando só há o nome do dia", () => {
  assert.equal(
    customerDayDisplay({ dayLabel: "Segunda-feira", dayDate: "2026-09-07" }),
    "Segunda-feira, 07/09"
  );
});

test("não duplica a data quando o rótulo já a contém", () => {
  assert.equal(
    customerDayDisplay({ dayLabel: "07/09 (segunda-feira)", dayDate: "2026-09-07" }),
    "07/09 (segunda-feira)"
  );
});

test("usa só a data quando não há rótulo", () => {
  assert.equal(customerDayDisplay({ dayDate: "2026-12-01" }), "01/12");
});

test("mantém o rótulo quando a data está ausente ou inválida", () => {
  assert.equal(customerDayDisplay({ dayLabel: "Segunda-feira" }), "Segunda-feira");
  assert.equal(customerDayDisplay({ dayLabel: "Sábado", dayDate: "amanhã" }), "Sábado");
});

test("devolve null quando não há nada para mostrar", () => {
  assert.equal(customerDayDisplay({}), null);
  assert.equal(customerDayDisplay({ dayLabel: "  ", dayDate: null }), null);
});
