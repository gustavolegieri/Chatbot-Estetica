const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";
const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function configuredTimeout(name: string, fallback: number, max: number): number {
  const configured = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(configured)) return fallback;
  return Math.max(2_000, Math.min(Math.round(configured), max));
}

export type WasenderAudioMessage = Record<string, unknown> & {
  url?: string;
  mediaKey?: string;
  mimetype?: string;
  fileLength?: string | number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function findAudioInMessage(message: Record<string, unknown>, depth = 0): WasenderAudioMessage | null {
  if (depth > 3) return null;
  const audio = asRecord(message.audioMessage);
  if (audio) return audio as WasenderAudioMessage;

  for (const wrapper of ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
    const wrapped = asRecord(message[wrapper]);
    const nested = wrapped ? asRecord(wrapped.message) : null;
    if (nested) {
      const found = findAudioInMessage(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function extractWasenderAudioMessage(messageEnvelope: Record<string, unknown>): WasenderAudioMessage | null {
  const message = asRecord(messageEnvelope.message);
  return message ? findAudioInMessage(message) : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function decryptWasenderAudio(params: {
  messageId: string;
  audio: WasenderAudioMessage;
}): Promise<string> {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) throw new Error("WASENDER_API_KEY não configurada");
  if (!params.audio.url || !params.audio.mediaKey) {
    throw new Error("Áudio recebido sem URL ou chave de mídia");
  }

  const declaredSize = Number(params.audio.fileLength ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_AUDIO_BYTES) {
    throw new Error("Áudio excede o limite de 16 MB");
  }

  const response = await fetchWithTimeout(
    `${WASENDER_BASE}/decrypt-media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          messages: {
            key: { id: params.messageId },
            message: { audioMessage: params.audio },
          },
        },
      }),
    },
    configuredTimeout("WHATSAPP_AUDIO_DECRYPT_TIMEOUT_MS", 8_000, 15_000)
  );

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; publicUrl?: string; message?: string }
    | null;
  if (!response.ok || !body?.publicUrl) {
    throw new Error(body?.message || `Falha ao descriptografar áudio (${response.status})`);
  }
  if (!/^https:\/\//i.test(body.publicUrl)) throw new Error("URL de áudio descriptografado inválida");
  return body.publicUrl;
}

export async function transcribeAudioWithGroq(audioUrl: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada");

  const form = new FormData();
  form.append("url", audioUrl);
  form.append("model", process.env.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Atendimento de estética automotiva em português do Brasil. Termos comuns: lavagem, higienização, polimento, vitrificação, agendamento e veículo."
  );

  const response = await fetchWithTimeout(
    GROQ_TRANSCRIPTION_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
    configuredTimeout("GROQ_TRANSCRIPTION_TIMEOUT_MS", 15_000, 30_000)
  );
  const body = (await response.json().catch(() => null)) as { text?: string; error?: { message?: string } } | null;
  const transcript = body?.text?.trim();
  if (!response.ok || !transcript) {
    throw new Error(body?.error?.message || `Falha ao transcrever áudio (${response.status})`);
  }
  return transcript.slice(0, 2_000);
}

export async function transcribeWasenderAudio(params: {
  messageId: string;
  audio: WasenderAudioMessage;
}): Promise<string> {
  const publicUrl = await decryptWasenderAudio(params);
  return transcribeAudioWithGroq(publicUrl);
}
