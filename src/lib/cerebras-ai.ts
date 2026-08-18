import { AsyncLocalStorage } from "node:async_hooks";

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "gpt-oss-120b";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
// Mantém o atendimento responsivo: após 6s o fluxo usa o fallback seguro do
// catálogo em vez de deixar o cliente esperando indefinidamente.
const AI_TOTAL_TIMEOUT_MS = 5_000;
const PRIMARY_TIMEOUT_MS = 2_500;
const cerebrasRuntime = new AsyncLocalStorage<{ enabled: boolean }>();

export function withCerebrasEnabled<T>(enabled: boolean, callback: () => Promise<T>): Promise<T> {
  return cerebrasRuntime.run({ enabled }, callback);
}

export function getCerebrasStatus() {
  return {
    configured: isCerebrasConfigured(),
    model: process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL,
    fallbackConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    fallbackModel: process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_MODEL,
  };
}

export function isCerebrasConfigured(): boolean {
  return Boolean(process.env.CEREBRAS_API_KEY?.trim());
}

export async function cerebrasChat(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  if (cerebrasRuntime.getStore()?.enabled === false) return null;
  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!cerebrasKey && !groqKey) return null;
  const startedAt = Date.now();

  const requestProvider = async (provider: {
    name: "Cerebras" | "Groq";
    url: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
  }): Promise<string | null> => {
  const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
      const res = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
          model: provider.model,
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
        console.error(`[${provider.name}] API error:`, res.status, err.slice(0, 300));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError" ? "request timed out" : e;
      console.error(`[${provider.name}] Request failed:`, message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
  };

  if (cerebrasKey) {
    const primary = await requestProvider({
      name: "Cerebras",
      url: CEREBRAS_URL,
      apiKey: cerebrasKey,
      model: process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL,
      timeoutMs: Math.min(PRIMARY_TIMEOUT_MS, AI_TOTAL_TIMEOUT_MS),
    });
    if (primary) return primary;
  }

  const remainingMs = AI_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
  if (!groqKey || remainingMs < 800) return null;
  console.warn("[IA] Cerebras indisponível; usando fallback Groq para manter o atendimento.");
  return requestProvider({
    name: "Groq",
    url: GROQ_URL,
    apiKey: groqKey,
    model: process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    timeoutMs: remainingMs,
  });
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
