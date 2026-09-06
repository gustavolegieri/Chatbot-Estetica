import assert from "node:assert/strict";
import test from "node:test";
import {
  detectAppointmentChangeIntent,
  stageAllowsAppointmentChange,
} from "./whatsapp-appointment-change";

test("pedido de cancelamento é reconhecido nas formas que o cliente escreve", () => {
  for (const frase of [
    "quero cancelar meu agendamento",
    "Preciso desmarcar",
    "não vou poder ir amanhã",
    "cancela por favor",
  ]) {
    assert.equal(detectAppointmentChangeIntent(frase), "cancel", frase);
  }
});

test("remarcar ganha de cancelar quando as duas palavras aparecem", () => {
  // "cancelar e remarcar" é troca de horário, não desistência: se cancelasse,
  // o cliente perderia a vaga e teria de recomeçar o atendimento do zero.
  assert.equal(detectAppointmentChangeIntent("quero cancelar e remarcar"), "reschedule");
  assert.equal(detectAppointmentChangeIntent("dá pra mudar o horário?"), "reschedule");
  assert.equal(detectAppointmentChangeIntent("preciso reagendar"), "reschedule");
});

test("mensagem sem intenção de mudança não mexe em reserva nenhuma", () => {
  for (const frase of ["oi", "quanto custa polimento?", "1", "meus agendamentos"]) {
    assert.equal(detectAppointmentChangeIntent(frase), null, frase);
  }
});

test("no meio de um orçamento, cancelar é sobre a compra atual", () => {
  assert.equal(stageAllowsAppointmentChange("ETAPA2_MAIN_MENU"), true);
  assert.equal(stageAllowsAppointmentChange("ETAPA10_FAQ"), true);
  assert.equal(stageAllowsAppointmentChange("ETAPA5_QUOTE"), false);
  assert.equal(stageAllowsAppointmentChange("ETAPA7_TIME"), false);
  assert.equal(stageAllowsAppointmentChange("ETAPA15_SUMMARY_CONFIRM"), false);
});
