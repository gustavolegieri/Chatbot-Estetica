import assert from "node:assert/strict";
import test from "node:test";
import { getVapidKeys } from "./pwa-push";

test("derives a stable Web Push key pair from the existing application secret", () => {
  const oldPublic = process.env.VAPID_PUBLIC_KEY;
  const oldPrivate = process.env.VAPID_PRIVATE_KEY;
  const oldSecret = process.env.JWT_SECRET;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-stability";

  try {
    const first = getVapidKeys();
    const second = getVapidKeys();
    assert.ok(first);
    assert.deepEqual(first, second);
    assert.equal(first.privateKey.length, 43);
    assert.ok(first.publicKey.length >= 86);
  } finally {
    if (oldPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = oldPublic;
    if (oldPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = oldPrivate;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
