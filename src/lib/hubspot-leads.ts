const DEFAULT_HUBSPOT_PORTAL_ID = "51824457";

export type HubSpotLeadInput = {
  name: string;
  phone: string;
  city: string;
  ipAddress?: string;
  pageUri?: string;
};

export type HubSpotLeadResult = {
  configured: boolean;
  synced: boolean;
  status?: number;
  error?: string;
};

export function getHubSpotPortalId() {
  return process.env.HUBSPOT_PORTAL_ID?.trim() || DEFAULT_HUBSPOT_PORTAL_ID;
}

export function isHubSpotLeadSyncConfigured() {
  return Boolean(getHubSpotPortalId() && process.env.HUBSPOT_FORM_GUID?.trim());
}

export async function submitLeadToHubSpot(input: HubSpotLeadInput): Promise<HubSpotLeadResult> {
  const portalId = getHubSpotPortalId();
  const formGuid = process.env.HUBSPOT_FORM_GUID?.trim();
  if (!formGuid) return { configured: false, synced: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const context: Record<string, string> = { pageName: "Avaliação Estética — Jundiaí" };
    if (input.pageUri) context.pageUri = input.pageUri;
    if (input.ipAddress) context.ipAddress = input.ipAddress;

    const response = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${encodeURIComponent(portalId)}/${encodeURIComponent(formGuid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          submittedAt: String(Date.now()),
          fields: [
            { objectTypeId: "0-1", name: "firstname", value: input.name },
            { objectTypeId: "0-1", name: "phone", value: input.phone },
            { objectTypeId: "0-1", name: "city", value: input.city },
          ],
          context,
          legalConsentOptions: {
            consent: {
              consentToProcess: true,
              text: "Autorizo a Garagem do Ka a usar meus dados para responder sobre avaliação, orçamento e agendamento.",
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        configured: true,
        synced: false,
        status: response.status,
        error: body.slice(0, 300) || "HubSpot recusou o cadastro",
      };
    }

    return { configured: true, synced: true, status: response.status };
  } catch (error) {
    return {
      configured: true,
      synced: false,
      error: error instanceof Error ? error.message : "Falha de conexão com o HubSpot",
    };
  } finally {
    clearTimeout(timeout);
  }
}
