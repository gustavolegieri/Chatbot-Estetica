import assert from "node:assert/strict";
import test from "node:test";
import { cerebrasChat } from "./cerebras-ai";
import { prisma } from "./prisma";
import { FLAG_CEREBRAS_INDISPONIVEL } from "./runtime-flags";

test("uses Groq automatically when Cerebras is unavailable", async () => {
  // O cooldown do provedor agora vive no banco e vale entre invocações. Um 402
  // real gravado por outra execução faria o teste começar já com o Cerebras
  // desligado — e o que se quer verificar aqui é justamente a primeira queda.
  await prisma.runtimeFlag
    .delete({ where: { key: FLAG_CEREBRAS_INDISPONIVEL } })
    .catch(() => undefined);

  const previousFetch = globalThis.fetch;
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const previousOllamaEnabled = process.env.OLLAMA_ENABLED;
  process.env.OLLAMA_ENABLED = "false";
  process.env.CEREBRAS_API_KEY = "cerebras-test";
  process.env.GROQ_API_KEY = "groq-test";
  const urls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("cerebras.ai")) {
      return new Response('{"message":"quota"}', { status: 402 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Resposta útil" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const answer = await cerebrasChat({ system: "Sistema", user: "Pergunta" });
    assert.equal(answer, "Resposta útil");
    assert.match(urls[0], /cerebras\.ai/);
    assert.match(urls[1], /groq\.com/);

    const secondAnswer = await cerebrasChat({ system: "Sistema", user: "Outra pergunta" });
    assert.equal(secondAnswer, "Resposta útil");
    assert.equal(urls.filter((url) => url.includes("cerebras.ai")).length, 1);
    assert.equal(urls.filter((url) => url.includes("groq.com")).length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
    if (previousOllamaEnabled === undefined) delete process.env.OLLAMA_ENABLED;
    else process.env.OLLAMA_ENABLED = previousOllamaEnabled;
  }
});

test("uses local Ollama without calling a cloud provider", async () => {
  const previousFetch = globalThis.fetch;
  const previousOllamaEnabled = process.env.OLLAMA_ENABLED;
  const previousLocalOnly = process.env.LOCAL_AI_ONLY;
  const previousOllamaUrl = process.env.OLLAMA_URL;
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const urls: string[] = [];

  process.env.OLLAMA_ENABLED = "true";
  process.env.LOCAL_AI_ONLY = "true";
  process.env.OLLAMA_URL = "http://127.0.0.1:11434";
  process.env.CEREBRAS_API_KEY = "nao-deve-ser-usada";
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ message: { content: "Resposta local em português" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const answer = await cerebrasChat({ system: "Sistema", user: "Pergunta" });
    assert.equal(answer, "Resposta local em português");
    assert.deepEqual(urls, ["http://127.0.0.1:11434/api/chat"]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOllamaEnabled === undefined) delete process.env.OLLAMA_ENABLED;
    else process.env.OLLAMA_ENABLED = previousOllamaEnabled;
    if (previousLocalOnly === undefined) delete process.env.LOCAL_AI_ONLY;
    else process.env.LOCAL_AI_ONLY = previousLocalOnly;
    if (previousOllamaUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = previousOllamaUrl;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
  }
});

test("a produção na Vercel não liga a ponte da IA local sozinha", async () => {
  // Regressão: `isLocalBridgeConfigured` era inferida de `VERCEL === "1"`, então
  // toda a produção esperava um PC que podia estar desligado, devolvia null e o
  // cliente recebia sempre o mesmo texto de fallback — nunca uma resposta de IA.
  const previousFetch = globalThis.fetch;
  const anterior: Record<string, string | undefined> = {};
  const definir = (chave: string, valor: string | undefined) => {
    anterior[chave] = process.env[chave];
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  };

  definir("VERCEL", "1");
  definir("LOCAL_AI_BRIDGE_ENABLED", undefined);
  definir("LOCAL_AI_BRIDGE_ALLOW_CLOUD_FALLBACK", undefined);
  definir("LOCAL_AI_ONLY", undefined);
  definir("OLLAMA_ENABLED", "false");
  definir("CEREBRAS_API_KEY", "cerebras-test");
  // Os dois provedores ficam disponíveis: o teste anterior pode ter deixado o
  // Cerebras em cooldown, e o que importa aqui é que a nuvem seja consultada.
  definir("GROQ_API_KEY", "groq-test");

  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ choices: [{ message: { content: "Resposta da nuvem" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { getCerebrasStatus } = await import("./cerebras-ai");
    assert.equal(getCerebrasStatus().bridgeConfigured, false);
    assert.equal(getCerebrasStatus().cloudFallbackEnabled, true);

    const resposta = await cerebrasChat({ system: "Sistema", user: "Quanto custa o polimento?" });
    assert.equal(resposta, "Resposta da nuvem");
    // A ponte nunca chama `fetch`: uma URL de nuvem prova que ela ficou de fora.
    assert.match(urls[0], /cerebras\.ai|groq\.com/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [chave, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }
});
