import test from "node:test";
import assert from "node:assert/strict";
import { calculateDistance, calculatePickupFee } from "./maps";

test("calculatePickupFee sums the base fee and per-km fee", () => {
  assert.equal(calculatePickupFee(4.5, 2.5, 5), 16.25);
  assert.equal(calculatePickupFee(0, 2.5, 5), 5);
});

test("calculateDistance uses the Distance Matrix dashboard endpoint when configured", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DISTANCEMATRIX_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_MAPS_API_KEY;

  process.env.DISTANCEMATRIX_API_KEY = "dashboard-key";
  delete process.env.GOOGLE_MAPS_API_KEY;

  const requests: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return {
      ok: true,
      json: async () => ({
        rows: [{ elements: [{ status: "OK", distance: { value: 2500 }, duration: { value: 1800 } }] }],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await calculateDistance("Rua das Flores, 123");
    assert.deepEqual(result, { distanceKm: 2.5, durationMin: 30 });
    assert.match(requests[0], /distancematrix\.ai/);
    assert.match(requests[0], /key=dashboard-key/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DISTANCEMATRIX_API_KEY;
    else process.env.DISTANCEMATRIX_API_KEY = originalKey;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalGoogleKey;
  }
});
