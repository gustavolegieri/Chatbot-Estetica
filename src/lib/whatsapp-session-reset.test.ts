import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_RESET_MS } from "./whatsapp-flow-types";
import { buildFreshFlowState, isSessionExpired, shouldRestartWithWelcome } from "./whatsapp-session-reset";

test("sessions restart only after one full hour without messages", async () => {
  assert.equal(SESSION_RESET_MS, 60 * 60 * 1000);
  assert.equal(await isSessionExpired(new Date(Date.now() - 59 * 60 * 1000)), false);
  assert.equal(await isSessionExpired(new Date(Date.now() - 61 * 60 * 1000)), true);
});

test("an expired or pending session always requests the welcome flow", () => {
  const flow = buildFreshFlowState();
  assert.equal(shouldRestartWithWelcome(new Date(), flow, true), true);
  assert.equal(shouldRestartWithWelcome(new Date(), { ...flow, pendingWelcomeRestart: true }, false), true);
  assert.deepEqual(flow, { stage: "ETAPA1_AWAITING_NAME", welcomed: false });
});
