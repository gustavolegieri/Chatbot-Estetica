import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const hasApiKey = !!process.env.WASENDER_API_KEY;
  const hasGroqKey = !!process.env.GROQ_API_KEY;
  const voiceRepliesEnabled = process.env.WHATSAPP_VOICE_REPLIES_ENABLED !== "false";
  const baseUrl = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

  return NextResponse.json({
    hasApiKey,
    hasGroqKey,
    voiceRepliesEnabled,
    ttsVoice: process.env.WHATSAPP_TTS_VOICE || "pt-BR-AntonioNeural",
    baseUrl,
    hasBaseUrl: !!process.env.WASENDER_BASE_URL
  });
}
