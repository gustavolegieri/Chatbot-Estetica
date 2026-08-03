import assert from "node:assert/strict";
import test from "node:test";
import {
  extractWasenderAudioMessage,
  transcribeWasenderAudio,
} from "./whatsapp-audio";
import { isVoiceReplyEligible, sanitizeTextForSpeech } from "./whatsapp-voice";

test("extracts direct and wrapped WhatsApp audio messages", () => {
  const direct = extractWasenderAudioMessage({
    message: { audioMessage: { url: "https://media.test/audio", mediaKey: "secret", ptt: true } },
  });
  assert.equal(direct?.ptt, true);

  const wrapped = extractWasenderAudioMessage({
    message: {
      ephemeralMessage: {
        message: { audioMessage: { url: "https://media.test/wrapped", mediaKey: "wrapped-key" } },
      },
    },
  });
  assert.equal(wrapped?.mediaKey, "wrapped-key");
});

test("prepares conversational text for Brazilian Portuguese voice", () => {
  const spoken = sanitizeTextForSpeech(
    "Olá, *Gustavo*! 🚗\n\nO polimento leva aproximadamente 3 horas.\n\n*1* — Agendar\n*2* — Voltar"
  );
  assert.match(spoken, /^Olá, Gustavo!/);
  assert.match(spoken, /3 horas/);
  assert.doesNotMatch(spoken, /Agendar|Voltar|🚗|\*/);
  assert.equal(isVoiceReplyEligible("O polimento leva aproximadamente três horas."), true);
  assert.equal(isVoiceReplyEligible("*1* — Agendar\n*2* — Voltar"), false);
});

test("decrypts Wasender audio and sends its temporary URL to Groq", async () => {
  const previousFetch = globalThis.fetch;
  const previousWasenderKey = process.env.WASENDER_API_KEY;
  const previousGroqKey = process.env.GROQ_API_KEY;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  process.env.WASENDER_API_KEY = "wasender-test";
  process.env.GROQ_API_KEY = "groq-test";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const normalizedUrl = String(url);
    calls.push({ url: normalizedUrl, init });
    if (normalizedUrl.includes("decrypt-media")) {
      return new Response(JSON.stringify({ success: true, publicUrl: "https://wasender.test/decrypted/audio.ogg" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ text: "Quero saber quanto custa o polimento" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const transcript = await transcribeWasenderAudio({
      messageId: "audio-message-1",
      audio: {
        url: "https://whatsapp.test/encrypted",
        mediaKey: "media-key",
        mimetype: "audio/ogg; codecs=opus",
        fileLength: 12_000,
      },
    });
    assert.equal(transcript, "Quero saber quanto custa o polimento");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /decrypt-media$/);
    assert.match(calls[1].url, /groq\.com\/openai\/v1\/audio\/transcriptions$/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWasenderKey === undefined) delete process.env.WASENDER_API_KEY;
    else process.env.WASENDER_API_KEY = previousWasenderKey;
    if (previousGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousGroqKey;
  }
});
