import assert from "node:assert/strict";
import test from "node:test";
import { eventoNaAgenda, proximaManutencao, rotaNoMapa } from "./whatsapp-links";

test("a rota abre o mapa no endereço da loja", () => {
  const url = rotaNoMapa("Rua Prof. Benedito Loureiro de Lima, 146, Jundiaí/SP");
  assert.ok(url?.startsWith("https://www.google.com/maps/dir/?api=1&destination="));
  assert.match(url!, /Benedito/);
  assert.equal(rotaNoMapa("  "), null);
});

test("o evento da agenda converte o horário de Brasília para UTC", () => {
  // 08:00 em São Paulo (-3) é 11:00 UTC; 90 minutos depois, 12:30 UTC.
  const url = eventoNaAgenda({
    titulo: "Lavagem Completa",
    inicio: new Date(2026, 8, 7, 8, 0, 0),
    duracaoMin: 90,
    local: "Jundiaí",
  });
  assert.match(url, /dates=20260907T110000Z%2F20260907T123000Z/);
  assert.match(url, /text=Lavagem\+Completa/);
});

test("a próxima manutenção sai por extenso, e só quando há intervalo", () => {
  assert.equal(proximaManutencao(new Date(2026, 8, 7), 90), "dezembro de 2026");
  assert.equal(proximaManutencao(new Date(2026, 8, 7), null), null);
  assert.equal(proximaManutencao(new Date(2026, 8, 7), 0), null);
});
