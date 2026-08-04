import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const DEFAULT_VOICE = "pt-BR-AntonioNeural";
const MAX_SPOKEN_CHARACTERS = 650;

export function voiceRepliesEnabled(): boolean {
  return process.env.WHATSAPP_VOICE_REPLIES_ENABLED !== "false";
}

export function sanitizeTextForSpeech(input: string): string {
  const withoutMenuLines = input
    .split(/\r?\n/)
    .filter((line) => !/^\s*\*?\d{1,2}\*?\s*(?:[—–-]|[📅🧭👤✅↩️💬💳💵])/.test(line))
    .join(" ");

  return withoutMenuLines
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\[MÍDIA:[^\]]+\]/gi, "")
    .replace(/[\*_~`#>|]+/g, "")
    .replace(/[━─]{2,}/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\uFE0E\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPOKEN_CHARACTERS);
}

export function isVoiceReplyEligible(text: string, options?: { force?: boolean }): boolean {
  if (!voiceRepliesEnabled()) return false;
  const spoken = sanitizeTextForSpeech(text);
  if (spoken.length < 8 || spoken.length > MAX_SPOKEN_CHARACTERS) return false;

  // Respostas explicitamente marcadas como dúvida devem virar áudio mesmo
  // quando mencionam pagamento, horários ou outras palavras operacionais.
  if (options?.force) return true;

  const numberedOptions = text.match(/^\s*\*?\d{1,2}\*?\s*(?:[—–-]|[📅🧭👤✅↩️💬💳💵])/gm)?.length ?? 0;
  if (numberedOptions >= 2) return false;
  if (/horários disponíveis|forma de pagamento|agendamento confirmado|resumo do agendamento/i.test(text)) {
    return false;
  }
  return true;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function synthesizeVoiceReply(text: string): Promise<Buffer> {
  const spoken = sanitizeTextForSpeech(text);
  if (!spoken) throw new Error("Texto vazio após preparação para voz");

  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    process.env.WHATSAPP_TTS_VOICE?.trim() || DEFAULT_VOICE,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );

  const { audioStream } = tts.toStream(escapeXml(spoken), {
    rate: process.env.WHATSAPP_TTS_RATE?.trim() || "+2%",
    pitch: process.env.WHATSAPP_TTS_PITCH?.trim() || "+0Hz",
    volume: "+0%",
  });

  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    audioStream.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    audioStream.on("error", (error) => {
      tts.close();
      reject(error);
    });
    audioStream.on("end", () => {
      const audio = Buffer.concat(chunks);
      tts.close();
      if (!audio.length) {
        reject(new Error("O serviço de voz não retornou áudio"));
        return;
      }
      resolve(audio);
    });
  });
}
