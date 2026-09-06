import { AsyncLocalStorage } from "node:async_hooks";
import { FLAG_CEREBRAS_INDISPONIVEL, flagAtiva, ligarFlag } from "./runtime-flags";

const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";
const OLLAMA_DEFAULT_MODEL = "qwen2.5:3b-instruct";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "gpt-oss-120b";
// `llama-3.3-70b-versatile` foi descontinuado na Groq e passou a responder 404
// (model_not_found), derrubando o fallback justamente quando ele era acionado.
// `openai/gpt-oss-120b` é o mesmo modelo usado no Cerebras, então os prompts do
// bot se comportam igual nos dois provedores.
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const AI_TOTAL_TIMEOUT_MS = 5_000;
const PRIMARY_TIMEOUT_MS = 2_500;
const DEFAULT_OLLAMA_TIMEOUT_MS = 45_000;
const cerebrasRuntime = new AsyncLocalStorage<{ enabled: boolean }>();
let cerebrasUnavailableUntil = 0;
// Quando o worker local não responde, a próxima mensagem não pode pagar o
// timeout de novo: o webhook do WhatsApp tem orçamento de segundos.
let localBridgeUnavailableUntil = 0;
const LOCAL_BRIDGE_COOLDOWN_MS = 5 * 60 * 1000;

function cerebrasCooldownForStatus(status: number): number {
  if (status === 401 || status === 402) return 10 * 60 * 1000;
  if (status === 429) return 60 * 1000;
  return 0;
}

function isEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function isOllamaConfigured(): boolean {
  return isEnabled(process.env.OLLAMA_ENABLED);
}

// A ponte depende de um PC ligado consumindo a fila `localAiJob`. Ela era
// inferida de `VERCEL === "1"`, então ficava ativa em toda a produção: cada
// chamada de IA esperava o timeout inteiro por um worker que podia nem existir
// e devolvia null. Com `isLocalOnly()` verdadeiro por tabela, a nuvem nunca era
// consultada e todo cliente recebia o mesmo texto de fallback. Agora a ponte só
// liga quando alguém a liga.
function isLocalBridgeConfigured(): boolean {
  return isEnabled(process.env.LOCAL_AI_BRIDGE_ENABLED);
}

function isLocalOnly(): boolean {
  if (isEnabled(process.env.LOCAL_AI_ONLY)) return true;
  return isLocalBridgeConfigured() && !isEnabled(process.env.LOCAL_AI_BRIDGE_ALLOW_CLOUD_FALLBACK);
}

function ollamaTimeoutMs(): number {
  const configured = Number(process.env.OLLAMA_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_OLLAMA_TIMEOUT_MS;
  return Math.min(60_000, Math.max(2_000, configured));
}

function localBridgeTimeoutMs(): number {
  const configured = Number(process.env.LOCAL_AI_BRIDGE_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 20_000;
  return Math.min(50_000, Math.max(3_000, configured));
}

export function withCerebrasEnabled<T>(enabled: boolean, callback: () => Promise<T>): Promise<T> {
  return cerebrasRuntime.run({ enabled }, callback);
}

export function getCerebrasStatus() {
  const directLocalConfigured = isOllamaConfigured();
  const bridgeConfigured = isLocalBridgeConfigured();
  const localConfigured = directLocalConfigured || bridgeConfigured;
  const cerebrasConfigured = Boolean(process.env.CEREBRAS_API_KEY?.trim());
  const groqConfigured = Boolean(process.env.GROQ_API_KEY?.trim());
  return {
    configured: localConfigured || cerebrasConfigured || groqConfigured,
    provider: directLocalConfigured
      ? "Ollama local"
      : bridgeConfigured
        ? "Ollama local (ponte)"
        : cerebrasConfigured
          ? "Cerebras"
          : groqConfigured
            ? "Groq"
            : "Nenhum",
    model: localConfigured
      ? process.env.OLLAMA_MODEL?.trim() || OLLAMA_DEFAULT_MODEL
      : process.env.CEREBRAS_MODEL?.trim() || DEFAULT_MODEL,
    localConfigured,
    directLocalConfigured,
    bridgeConfigured,
    localUrl: process.env.OLLAMA_URL?.trim() || OLLAMA_DEFAULT_URL,
    cloudFallbackEnabled: !isLocalOnly(),
    fallbackConfigured: groqConfigured,
    fallbackModel: process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_MODEL,
  };
}

export function isCerebrasConfigured(): boolean {
  return getCerebrasStatus().configured;
}

async function requestLocalBridge(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const { prisma } = await import("./prisma");
  const timeoutMs = localBridgeTimeoutMs();
  const deadline = Date.now() + timeoutMs;
  const job = await prisma.localAiJob.create({
    data: {
      system: params.system,
      user: params.user,
      maxTokens: params.maxTokens ?? 512,
      temperature: params.temperature ?? 0.2,
      expiresAt: new Date(deadline + 5_000),
    },
    select: { id: true },
  });

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = await prisma.localAiJob.findUnique({
      where: { id: job.id },
      select: { status: true, response: true, error: true },
    });
    if (result?.status === "COMPLETED") return result.response?.trim() || null;
    if (result?.status === "FAILED") {
      console.error("[Ollama Local] Worker falhou:", result.error);
      return null;
    }
  }

  await prisma.localAiJob.updateMany({
    where: { id: job.id, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status: "EXPIRED", error: "Tempo limite da ponte local excedido" },
  });
  localBridgeUnavailableUntil = Date.now() + LOCAL_BRIDGE_COOLDOWN_MS;
  console.error("[Ollama Local] Tempo limite da ponte excedido; pausando a ponte por 5 min.");
  return null;
}

async function requestOllama(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ollamaTimeoutMs());
  const baseUrl = (process.env.OLLAMA_URL?.trim() || OLLAMA_DEFAULT_URL).replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL?.trim() || OLLAMA_DEFAULT_MODEL,
        stream: false,
        keep_alive: -1,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        options: {
          temperature: params.temperature ?? 0.2,
          num_predict: params.maxTokens ?? 512,
          num_ctx: 4096,
        },
      }),
    });

    if (!res.ok) {
      const error = await res.text().catch(() => "");
      console.error("[Ollama Local] Erro:", res.status, error.slice(0, 300));
      return null;
    }

    const data = (await res.json()) as { message?: { content?: string }; response?: string };
    return data.message?.content?.trim() || data.response?.trim() || null;
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "tempo limite excedido" : error;
    console.error("[Ollama Local] Falha na requisição:", message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function cerebrasChat(params: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  if (cerebrasRuntime.getStore()?.enabled === false) return null;

  if (isOllamaConfigured()) {
    const localAnswer = await requestOllama(params);
    if (localAnswer) return localAnswer;
    if (isLocalOnly()) return null;
    console.warn("[IA] Ollama local indisponível; tentando fallback externo.");
  }

  if (isLocalBridgeConfigured() && Date.now() >= localBridgeUnavailableUntil) {
    const bridgeAnswer = await requestLocalBridge(params);
    if (bridgeAnswer) {
      localBridgeUnavailableUntil = 0;
      return bridgeAnswer;
    }
    if (isLocalOnly()) return null;
    console.warn("[IA] Ponte da IA local indisponível; tentando fallback externo.");
  }

  const cerebrasKey = process.env.CEREBRAS_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!cerebrasKey && !groqKey) return null;
  let startedAt = Date.now();

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
        const error = await res.text().catch(() => "");
        if (provider.name === "Cerebras") {
          const cooldown = cerebrasCooldownForStatus(res.status);
          if (cooldown > 0) cerebrasUnavailableUntil = Date.now() + cooldown;
          // O cooldown precisa atravessar a invocação: sem isso, cada mensagem
          // em uma instância nova paga de novo a resposta 402.
          if (cooldown > 0) {
            void ligarFlag(FLAG_CEREBRAS_INDISPONIVEL, String(res.status), cooldown);
          }
        }
        console.error(`[${provider.name}] API error:`, res.status, error.slice(0, 300));
        return null;
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "request timed out" : error;
      console.error(`[${provider.name}] Request failed:`, message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const cerebrasEmCooldown =
    Date.now() < cerebrasUnavailableUntil || (await flagAtiva(FLAG_CEREBRAS_INDISPONIVEL));
  // A consulta ao marcador é I/O e não pode comer o orçamento de resposta da
  // IA: o relógio do atendimento começa depois dela.
  startedAt = Date.now();

  if (cerebrasKey && !cerebrasEmCooldown) {
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

/** Extrai JSON de resposta que pode vir com markdown. */
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
