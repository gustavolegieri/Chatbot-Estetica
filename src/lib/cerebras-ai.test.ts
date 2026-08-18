import assert from "node:assert/strict";
import test from "node:test";
import { cerebrasChat } from "./cerebras-ai";

test("uses Groq automatically when Cerebras is unavailable", async () => {
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
