const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const DEFAULT_MODEL = "gpt-oss-120b";

export function isCerebrasConfigured(): boolean {
  return Boolean(process.env.CEREBRAS_API_KEY?.trim());
}

export async function cerebrasChat(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL;

  try {
    const res = await fetch(CEREBRAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        temperature: params.temperature ?? 0.2,
        max_completion_tokens: params.maxTokens ?? 512,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[Cerebras] API error:", res.status, err.slice(0, 300));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch (e) {
    console.error("[Cerebras] Request failed:", e);
    return null;
  }
}

/** Extrai JSON de resposta que pode vir com markdown */
export function parseJsonFromModel<T>(raw: string): T | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
