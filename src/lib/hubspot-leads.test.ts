import assert from "node:assert/strict";
import test from "node:test";
import { isHubSpotLeadSyncConfigured, submitLeadToHubSpot } from "./hubspot-leads";

test("keeps HubSpot disabled until a published form GUID is configured", async () => {
  const oldGuid = process.env.HUBSPOT_FORM_GUID;
  delete process.env.HUBSPOT_FORM_GUID;
  try {
    assert.equal(isHubSpotLeadSyncConfigured(), false);
    assert.deepEqual(
      await submitLeadToHubSpot({ name: "Cliente", phone: "5511999999999", city: "Jundiaí" }),
      { configured: false, synced: false }
    );
  } finally {
    if (oldGuid === undefined) delete process.env.HUBSPOT_FORM_GUID;
    else process.env.HUBSPOT_FORM_GUID = oldGuid;
  }
});

test("submits only the consented contact fields to the configured HubSpot form", async () => {
  const oldPortal = process.env.HUBSPOT_PORTAL_ID;
  const oldGuid = process.env.HUBSPOT_FORM_GUID;
  const oldFetch = globalThis.fetch;
  process.env.HUBSPOT_PORTAL_ID = "51824457";
  process.env.HUBSPOT_FORM_GUID = "11111111-2222-3333-4444-555555555555";

  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(null, { status: 204 });
  };

  try {
    const result = await submitLeadToHubSpot({
      name: "Cliente Autorizado",
      phone: "5511999999999",
      city: "Jundiaí",
      pageUri: "https://example.com/jundiai",
    });

    assert.equal(result.synced, true);
    assert.match(requestUrl, /api\.hsforms\.com\/submissions\/v3\/integration\/submit\/51824457\//);
    assert.deepEqual(requestBody.fields, [
      { objectTypeId: "0-1", name: "firstname", value: "Cliente Autorizado" },
      { objectTypeId: "0-1", name: "phone", value: "5511999999999" },
      { objectTypeId: "0-1", name: "city", value: "Jundiaí" },
    ]);
    assert.equal(
      ((requestBody.legalConsentOptions as { consent: { consentToProcess: boolean } }).consent.consentToProcess),
      true
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (oldPortal === undefined) delete process.env.HUBSPOT_PORTAL_ID;
    else process.env.HUBSPOT_PORTAL_ID = oldPortal;
    if (oldGuid === undefined) delete process.env.HUBSPOT_FORM_GUID;
    else process.env.HUBSPOT_FORM_GUID = oldGuid;
  }
});
