import assert from "node:assert/strict";
import test from "node:test";
import { isConfirmationMessage } from "./appointment-confirmation";
import { isAdvanceConfirmationDue } from "./appointment-reminders";
import { appointmentStartsAt, wasMessageSent } from "./appointment-whatsapp";

test("confirmation reminder opens around two hours before the appointment", () => {
  assert.equal(isAdvanceConfirmationDue(125), true);
  assert.equal(isAdvanceConfirmationDue(120), true);
  assert.equal(isAdvanceConfirmationDue(96), true);
  assert.equal(isAdvanceConfirmationDue(130), false);
  assert.equal(isAdvanceConfirmationDue(94), false);
});

test("explicit CONFIRME is recognized independently from the conversation stage", () => {
  assert.equal(isConfirmationMessage("CONFIRME"), true);
  assert.equal(isConfirmationMessage("confirmo o agendamento"), true);
  assert.equal(isConfirmationMessage("1"), false);
  assert.equal(isConfirmationMessage("sim"), false);
});

test("appointment time is interpreted in Sao Paulo even when the server runs in UTC", () => {
  const startsAt = appointmentStartsAt(new Date("2026-08-03T00:00:00.000Z"), "10:00");
  assert.equal(startsAt.toISOString(), "2026-08-03T13:00:00.000Z");
});

test("failed or blocked WhatsApp sends are not marked as delivered", () => {
  assert.equal(wasMessageSent({ success: true }), true);
  assert.equal(wasMessageSent({ error: true }), false);
  assert.equal(wasMessageSent({ blocked: true }), false);
  assert.equal(wasMessageSent(null), false);
});
