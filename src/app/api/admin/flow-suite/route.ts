import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFlowSuiteReport } from "@/lib/flow-suite-report";
import { analyzeConversationRules } from "@/lib/conversation-intelligence";
import { invalidatePromptCache } from "@/lib/bot-prompts";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

let cache: { value: Awaited<ReturnType<typeof getFlowSuiteReport>>; savedAt: number } | null = null;

export async function GET(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    if (!refresh && cache && Date.now() - cache.savedAt < 45_000) return NextResponse.json({ success: true, data: cache.value, cached: true });
    const report = await getFlowSuiteReport();
    cache = { value: report, savedAt: Date.now() };
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("[Flow Suite] Falha ao montar central", error);
    return NextResponse.json({ success: false, error: "Não foi possível analisar o fluxo" }, { status: 500 });
  }
}

const PERSONAS: Record<string, { name: string; channel: "text" | "audio"; messages: string[] }> = {
  undecided: { name: "Cliente indeciso", channel: "text", messages: ["Oi, meu carro está meio encardido por dentro e por fora, mas não sei qual serviço fazer", "Tenho medo de ficar caro", "Pode ser sábado de manhã"] },
  hurried: { name: "Cliente apressado", channel: "text", messages: ["Preciso lavar hoje, tem horário?", "É um Onix 2022", "Pode reservar o primeiro horário"] },
  complaint: { name: "Cliente reclamando", channel: "text", messages: ["Fiz o serviço e não gostei, ficou uma mancha", "Quero falar com alguém responsável"] },
  price: { name: "Cliente pesquisando preço", channel: "text", messages: ["Quanto custa um polimento?", "Tem uma opção mais barata?", "Vou pensar"] },
  audio: { name: "Cliente por áudio", channel: "audio", messages: ["Meu banco está manchado e queria saber quanto custa para higienizar e se tem horário amanhã", "É um Honda Fit 2020"] },
};

export async function POST(request: NextRequest) {
  const auth = await getSession();
  if (!auth) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string; persona?: string; versionId?: string };

  if (body.action === "simulate") {
    const persona = PERSONAS[body.persona || "undecided"] ?? PERSONAS.undecided;
    let previous: ReturnType<typeof analyzeConversationRules> | undefined;
    const transcript = persona.messages.flatMap((message, index) => {
      const analysis = analyzeConversationRules(message, previous);
      previous = analysis;
      const stage = analysis.needsHuman ? "HANDOFF" : analysis.intent === "schedule" ? "ETAPA7_DAY" : analysis.intent === "price" ? "ETAPA5_QUOTE" : index === 0 ? "ETAPA2_MAIN_MENU" : "ETAPA3_SERVICE_ACTION";
      const reply = analysis.needsHuman
        ? "Entendi a situação e já estou encaminhando seu atendimento com prioridade para a equipe."
        : analysis.intent === "schedule"
          ? "Entendi. Primeiro confirmo o serviço e, em seguida, mostro o calendário com os horários realmente disponíveis."
          : analysis.objection === "price"
            ? "Posso explicar o que está incluído e indicar a opção com melhor custo-benefício para o seu veículo."
            : "Entendi o que você precisa. Vou usar essas informações para indicar o cuidado mais adequado.";
      return [
        { id: `${index}-in`, direction: "INBOUND", channel: persona.channel, text: message, stage, analysis },
        { id: `${index}-out`, direction: "OUTBOUND", channel: analysis.intent === "price" || persona.channel === "audio" ? "audio" : "text", text: reply, stage, analysis: null },
      ];
    });
    return NextResponse.json({ success: true, data: { persona, transcript, result: previous, passed: !transcript.some((item) => !item.text), handoff: previous?.needsHuman ?? false } });
  }

  if (body.action === "restore-version") {
    if (!body.versionId) return NextResponse.json({ success: false, error: "Versão obrigatória" }, { status: 400 });
    const version = await prisma.auditLog.findUnique({ where: { id: body.versionId } });
    if (!version || !["FLOW_PROMPT_VERSION_CREATED", "FLOW_PROMPT_RESET"].includes(version.action)) return NextResponse.json({ success: false, error: "Versão não encontrada" }, { status: 404 });
    const data = version.data && typeof version.data === "object" && !Array.isArray(version.data) ? version.data as Record<string, unknown> : {};
    const key = typeof data.key === "string" ? data.key : version.resource.replace("bot-prompt:", "");
    const content = typeof data.previousContent === "string" ? data.previousContent : null;
    if (!key || !content) return NextResponse.json({ success: false, error: "Conteúdo da versão indisponível" }, { status: 400 });
    const current = await prisma.botPrompt.findUnique({ where: { key } });
    const prompt = await prisma.botPrompt.update({ where: { key }, data: { content } });
    await logAudit({ userId: auth.userId, action: "FLOW_PROMPT_VERSION_RESTORED", resource: `bot-prompt:${key}`, data: { key, previousContent: current?.content ?? "", content, restoredFrom: version.id } });
    invalidatePromptCache(); cache = null;
    return NextResponse.json({ success: true, data: prompt });
  }

  return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
}
