import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cerebrasChat, isCerebrasConfigured } from "@/lib/cerebras-ai";
import { getAiAutomationReport } from "@/lib/ai-automation-report";

export const runtime = "nodejs";
export const maxDuration = 30;

let cache: { data: Awaited<ReturnType<typeof getAiAutomationReport>>; expiresAt: number } | null = null;

async function report(force = false) {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.data;
  const data = await getAiAutomationReport();
  cache = { data, expiresAt: Date.now() + 60_000 };
  return data;
}

export async function GET(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    const data = await report(request.nextUrl.searchParams.get("refresh") === "true");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[AI Automation] relatório", error);
    return NextResponse.json({ success: false, error: "Não foi possível analisar a operação" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  if (!isCerebrasConfigured()) return NextResponse.json({ success: false, error: "Cerebras não configurada" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) return NextResponse.json({ success: false, error: "Escreva uma pergunta" }, { status: 400 });
  const data = await report();
  const answer = await cerebrasChat({
    system: "Você é o copiloto de gestão da Garagem do Ka. Responda em português, de forma objetiva e acionável. Use somente os dados fornecidos, deixe claro quando não houver informação e nunca invente valores ou clientes.",
    user: `Dados: ${JSON.stringify({ metrics: data.metrics, distributions: data.distributions, hotLeads: data.hotLeads.slice(0, 8), priority: data.priority.slice(0, 8) })}\nPergunta: ${question}`,
    maxTokens: 500,
    temperature: 0.2,
  });
  return NextResponse.json({ success: true, data: { answer: answer || "Não consegui concluir esta análise agora." } });
}
