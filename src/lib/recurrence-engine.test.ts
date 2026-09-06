import assert from "node:assert/strict";
import test from "node:test";
import {
  WARRANTY_NOTICE_DAYS,
  classifyRecurrence,
  daysBetween,
  dedupeByClient,
  hhmmInSaoPaulo,
  humanizeElapsed,
  isWithinSendWindow,
  rankCandidates,
  resolveRecurrenceDays,
  type RecurrenceCandidate,
} from "./recurrence-engine";

const NOW = new Date("2026-09-04T15:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

test("resolveRecurrenceDays prioriza o cadastro sobre o catálogo", () => {
  assert.equal(resolveRecurrenceDays({ recurrenceDays: 30, name: "Vitrificação" }), 30);
});

test("resolveRecurrenceDays infere o intervalo pelo nome do serviço", () => {
  assert.equal(resolveRecurrenceDays({ recurrenceDays: null, name: "Vitrificação de pintura" }), 365);
  assert.equal(resolveRecurrenceDays({ recurrenceDays: null, name: "Polimento técnico" }), 180);
  assert.equal(resolveRecurrenceDays({ recurrenceDays: null, name: "Higienização interna" }), 180);
  assert.equal(resolveRecurrenceDays({ recurrenceDays: null, name: "Lavagem completa" }), 21);
});

test("resolveRecurrenceDays não inventa periodicidade para serviço desconhecido", () => {
  assert.equal(resolveRecurrenceDays({ recurrenceDays: null, name: "Instalação de película" }), null);
  assert.equal(resolveRecurrenceDays({ recurrenceDays: 0, name: "Serviço avulso" }), null);
});

test("classifyRecurrence só libera contato depois do intervalo", () => {
  const antes = classifyRecurrence({ lastServiceAt: daysAgo(20), now: NOW, intervalDays: 21 });
  assert.equal(antes.eligible, false);

  const depois = classifyRecurrence({ lastServiceAt: daysAgo(30), now: NOW, intervalDays: 21 });
  assert.equal(depois.eligible, true);
  if (depois.eligible) {
    assert.equal(depois.kind, "due");
    assert.equal(depois.daysSince, 30);
    assert.equal(depois.overdueDays, 9);
  }
});

test("classifyRecurrence ignora serviço sem intervalo conhecido", () => {
  assert.equal(
    classifyRecurrence({ lastServiceAt: daysAgo(900), now: NOW, intervalDays: null }).eligible,
    false
  );
});

test("classifyRecurrence avisa a garantia antes do vencimento", () => {
  const result = classifyRecurrence({
    lastServiceAt: daysAgo(365 - 10),
    now: NOW,
    intervalDays: 365,
    warrantyDays: 365,
  });
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.equal(result.kind, "warranty");
    assert.equal(result.warrantyEndsInDays, 10);
  }
});

test("classifyRecurrence não avisa garantia fora da janela", () => {
  const cedo = classifyRecurrence({
    lastServiceAt: daysAgo(365 - WARRANTY_NOTICE_DAYS - 1),
    now: NOW,
    intervalDays: 365,
    warrantyDays: 365,
  });
  assert.equal(cedo.eligible, false);

  // Garantia já vencida volta a ser um caso comum de recorrência, não um aviso.
  const vencida = classifyRecurrence({
    lastServiceAt: daysAgo(400),
    now: NOW,
    intervalDays: 365,
    warrantyDays: 365,
  });
  assert.equal(vencida.eligible, true);
  if (vencida.eligible) assert.equal(vencida.kind, "due");
});

test("classifyRecurrence descarta data futura", () => {
  const futuro = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
  assert.equal(classifyRecurrence({ lastServiceAt: futuro, now: NOW, intervalDays: 21 }).eligible, false);
});

test("daysBetween conta dias completos", () => {
  assert.equal(daysBetween(daysAgo(3), NOW), 3);
  assert.equal(daysBetween(NOW, NOW), 0);
});

function candidate(partial: Partial<RecurrenceCandidate>): RecurrenceCandidate {
  return {
    appointmentId: "apt",
    clientId: "cli",
    clientName: "Cliente",
    phone: "5511999999999",
    vehicle: "Civic",
    serviceId: "srv",
    serviceName: "Lavagem",
    lastServiceAt: daysAgo(60),
    kind: "due",
    daysSince: 60,
    intervalDays: 21,
    overdueDays: 39,
    warrantyEndsInDays: null,
    ...partial,
  };
}

test("rankCandidates coloca garantia na frente e ordena pelo mais urgente", () => {
  const ordered = rankCandidates([
    candidate({ appointmentId: "atrasado-pouco", overdueDays: 5 }),
    candidate({ appointmentId: "garantia-tarde", kind: "warranty", warrantyEndsInDays: 12 }),
    candidate({ appointmentId: "atrasado-muito", overdueDays: 90 }),
    candidate({ appointmentId: "garantia-urgente", kind: "warranty", warrantyEndsInDays: 2 }),
  ]);
  assert.deepEqual(
    ordered.map((item) => item.appointmentId),
    ["garantia-urgente", "garantia-tarde", "atrasado-muito", "atrasado-pouco"]
  );
});

test("dedupeByClient mantém apenas o primeiro motivo de cada cliente", () => {
  const result = dedupeByClient([
    candidate({ clientId: "a", appointmentId: "a1" }),
    candidate({ clientId: "a", appointmentId: "a2" }),
    candidate({ clientId: "b", appointmentId: "b1" }),
  ]);
  assert.deepEqual(
    result.map((item) => item.appointmentId),
    ["a1", "b1"]
  );
});

test("isWithinSendWindow respeita a janela local", () => {
  // 15:00 UTC = 12:00 em São Paulo (UTC-3).
  assert.equal(hhmmInSaoPaulo(NOW), "12:00");
  assert.equal(isWithinSendWindow(NOW, "09:00", "19:00"), true);
  assert.equal(isWithinSendWindow(NOW, "13:00", "19:00"), false);
  assert.equal(isWithinSendWindow(NOW, "09:00", "11:59"), false);
});

test("isWithinSendWindow libera envio quando a configuração é inválida", () => {
  assert.equal(isWithinSendWindow(NOW, "", ""), true);
  assert.equal(isWithinSendWindow(NOW, "19:00", "09:00"), true);
});

test("humanizeElapsed usa a unidade natural para cada faixa", () => {
  assert.equal(humanizeElapsed(20), "20 dias");
  assert.equal(humanizeElapsed(180), "6 meses");
  assert.equal(humanizeElapsed(365), "1 ano");
  assert.equal(humanizeElapsed(760), "2 anos e 1 mês");
});
