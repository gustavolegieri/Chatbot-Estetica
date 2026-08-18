import assert from "node:assert/strict";
import test from "node:test";
import { cerebrasChat } from "./cerebras-ai";

test("uses Groq automatically when Cerebras is unavailable", async () => {
  const previousFetch = globalThis.fetch;
  const previousCerebrasKey = process.env.CEREBRAS_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
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
  } finally {
    globalThis.fetch = previousFetch;
    if (previousCerebrasKey === undefined) delete process.env.CEREBRAS_API_KEY;
    else process.env.CEREBRAS_API_KEY = previousCerebrasKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  }
});
