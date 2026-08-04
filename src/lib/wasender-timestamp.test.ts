import assert from "node:assert/strict";
import test from "node:test";
import { isWasenderMessageTooOld } from "./wasender-timestamp";

const now = Date.UTC(2026, 7, 4, 12, 0, 0);

test("accepts recent Unix timestamps in seconds and milliseconds", () => {
  assert.equal(isWasenderMessageTooOld(Math.floor((now - 60_000) / 1000), now), false);
  assert.equal(isWasenderMessageTooOld(now - 60_000, now), false);
});

test("rejects only events older than 24 hours", () => {
  assert.equal(isWasenderMessageTooOld(now - 25 * 60 * 60 * 1000, now), true);
  assert.equal(isWasenderMessageTooOld("invalid", now), false);
});
