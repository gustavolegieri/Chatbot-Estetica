/**
 * Publicação de Instagram Stories via Graph API (conta Business).
 * Fluxo: criar container (STORIES) → aguardar FINISHED → media_publish.
 */

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type InstagramPublishResult = {
  creationId: string;
  mediaId: string;
  imageUrl: string;
};

function getCredentials() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accessToken || !igUserId) {
    throw new Error(
      "Instagram não configurado: defina INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID"
    );
  }
  return { accessToken, igUserId };
}

async function graphPost(path: string, body: Record<string, string>) {
  const { accessToken } = getCredentials();
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message || `Instagram API erro HTTP ${res.status}`);
  }
  return json;
}

async function graphGet(path: string, params: Record<string, string> = {}) {
  const { accessToken } = getCredentials();
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message || `Instagram API erro HTTP ${res.status}`);
  }
  return json;
}

async function waitContainerReady(creationId: string, attempts = 12): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const status = await graphGet(`/${creationId}`, { fields: "status_code" });
    const code = String(status.status_code ?? "");
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Container do story falhou: ${code}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timeout aguardando processamento do story no Instagram");
}

/** Publica uma imagem pública HTTPS como Story. */
export async function publishInstagramStory(imageUrl: string): Promise<InstagramPublishResult> {
  const { igUserId } = getCredentials();

  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error("A URL da imagem do story precisa ser HTTPS pública");
  }

  const created = await graphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    media_type: "STORIES",
  });

  const creationId = String(created.id ?? "");
  if (!creationId) throw new Error("Instagram não retornou creation_id do container");

  await waitContainerReady(creationId);

  const published = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: creationId,
  });

  const mediaId = String(published.id ?? "");
  if (!mediaId) throw new Error("Instagram não retornou id da mídia publicada");

  return { creationId, mediaId, imageUrl };
}

/** Métricas de Story (podem ficar indisponíveis após 24h). */
export async function fetchStoryInsights(mediaId: string): Promise<{
  reach: number | null;
  impressions: number | null;
}> {
  try {
    const json = await graphGet(`/${mediaId}/insights`, {
      metric: "reach,views,navigation",
    });
    const data = (json.data as Array<{ name?: string; values?: Array<{ value?: number }> }>) ?? [];
    const get = (name: string) => {
      const row = data.find((d) => d.name === name);
      const v = row?.values?.[0]?.value;
      return typeof v === "number" ? v : null;
    };
    return {
      reach: get("reach"),
      impressions: get("views") ?? get("impressions"),
    };
  } catch {
    return { reach: null, impressions: null };
  }
}

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
}
