import { subDays, subHours } from "date-fns";
import { prisma } from "./prisma";
import { cerebrasChat, isCerebrasConfigured } from "./cerebras-ai";
import { analyzeConversationRules, type ConversationIntelligence } from "./conversation-intelligence";
import type { FlowState } from "./whatsapp-flow-types";

function flowOf(value: unknown): FlowState {
  return value && typeof value === "object" && !Array.isArray(value) ? value as FlowState : { stage: "ETAPA1_AWAITING_NAME" };
}

const labels: Record<string, string> = {
  price: "Preço", time: "Tempo", trust: "Confiança", availability: "Disponibilidade", none: "Sem objeção",
  positive: "Positivo", neutral: "Neutro", negative: "Negativo",
};

export async function getAiAutomationReport() {
  const now = new Date();
  const dayAgo = subHours(now, 24);
  const weekAgo = subDays(now, 7);
  const monthAgo = subDays(now, 30);

  const [sessions, messages24h, appointments, queue, settings] = await prisma.$transaction([
    prisma.whatsAppSession.findMany({
      where: { lastMessageAt: { gte: monthAgo }, NOT: [{ phone: "" }, { phone: { startsWith: "test-" } }] },
      include: { client: true },
      orderBy: { lastMessageAt: "desc" },
      take: 240,
    }),
    prisma.whatsAppMessage.findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { direction: true, sender: true, body: true, createdAt: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 1200,
    }),
    prisma.appointment.findMany({
      where: { createdAt: { gte: monthAgo } },
      select: { status: true, source: true, finalPrice: true, service: { select: { price: true, name: true } } },
    }),
    prisma.outboundMessageQueue.count({ where: { processedAt: null } }),
    prisma.settings.findUnique({ where: { id: "default" }, select: { whatsappEnabled: true, testModeEnabled: true } }),
  ]);

  const analyzed = sessions.map((session) => {
    const flow = flowOf(session.metadata);
    const ai = flow.aiIntelligence ?? (session.lastMessagePreview ? analyzeConversationRules(session.lastMessagePreview) : undefined);
    return { session, flow, ai };
  }).filter((item): item is typeof item & { ai: ConversationIntelligence } => Boolean(item.ai));

  const inbound = messages24h.filter((item) => item.direction === "INBOUND");
  const outbound = messages24h.filter((item) => item.direction === "OUTBOUND");
  const answeredPhones = new Set(outbound.map((item) => item.phone));
  const unanswered = new Set(inbound.filter((item) => !answeredPhones.has(item.phone)).map((item) => item.phone)).size;
  const hotLeads = analyzed.filter((item) => item.ai.leadScore >= 70 && !item.ai.needsHuman).slice(0, 20);
  const priority = analyzed.filter((item) => item.ai.needsHuman || item.ai.urgency === "critical" || item.ai.urgency === "high").slice(0, 20);
  const lowConfidence = analyzed.filter((item) => item.ai.confidence < 65).slice(0, 20);
  const negative = analyzed.filter((item) => item.ai.sentiment === "negative");
  const completed = appointments.filter((item) => item.status === "COMPLETED").length;
  const cancelled = appointments.filter((item) => item.status === "CANCELLED" || item.status === "NO_SHOW").length;

  function countBy(key: "objection" | "sentiment" | "intent") {
    const map = new Map<string, number>();
    for (const item of analyzed) map.set(item.ai[key], (map.get(item.ai[key]) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, label: labels[name] ?? name, count })).sort((a, b) => b.count - a.count);
  }

  const signal = (item: typeof analyzed[number]) => ({
    id: item.session.id,
    phone: item.session.phone,
    clientName: item.session.client?.name ?? item.flow.customerName ?? "Novo contato",
    vehicle: item.session.client?.vehicleModel ?? item.flow.vehicleRaw ?? null,
    service: item.flow.serviceLabel ?? null,
    lastMessageAt: item.session.lastMessageAt,
    lastMessagePreview: item.session.lastMessagePreview,
    handoffStatus: item.session.handoffStatus,
    ...item.ai,
    href: `/admin/atendimento?phone=${encodeURIComponent(item.session.phone)}`,
  });

  const anomalyScore = Math.min(100, unanswered * 12 + queue * 4 + negative.length * 3);
  const metrics = {
    analyzed: analyzed.length,
    hotLeads: hotLeads.length,
    priority: priority.length,
    averageLeadScore: analyzed.length ? Math.round(analyzed.reduce((sum, item) => sum + item.ai.leadScore, 0) / analyzed.length) : 0,
    averageConfidence: analyzed.length ? Math.round(analyzed.reduce((sum, item) => sum + item.ai.confidence, 0) / analyzed.length) : 0,
    inbound24h: inbound.length,
    outbound24h: outbound.length,
    unanswered,
    queue,
    negative: negative.length,
    conversion: appointments.length ? Math.round((completed / appointments.length) * 100) : 0,
    lossRate: appointments.length ? Math.round((cancelled / appointments.length) * 100) : 0,
    anomalyScore,
  };

  const fallbackBrief = priority.length
    ? `${priority.length} conversa(s) exigem prioridade. Existem ${hotLeads.length} oportunidades quentes e ${queue} mensagens na fila.`
    : `A operação está estável, com ${hotLeads.length} oportunidade(s) quentes e ${metrics.averageConfidence}% de confiança média.`;
  let executiveBrief = fallbackBrief;
  if (isCerebrasConfigured() && analyzed.length) {
    const raw = await Promise.race([
      cerebrasChat({
        system: "Você é um copiloto executivo de uma estética automotiva. Produza um resumo direto, em português, com no máximo 3 frases, baseado apenas nos números. Destaque prioridade, oportunidade e risco; não invente.",
        user: JSON.stringify({ ...metrics, objections: countBy("objection").slice(0, 4), sentiments: countBy("sentiment"), period: "últimas 24h/30 dias" }),
        maxTokens: 220,
        temperature: 0.2,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_200)),
    ]);
    if (raw) executiveBrief = raw.slice(0, 650);
  }

  return {
    generatedAt: now.toISOString(),
    executiveBrief,
    metrics,
    settings,
    distributions: { objections: countBy("objection"), sentiments: countBy("sentiment"), intents: countBy("intent") },
    hotLeads: hotLeads.map(signal),
    priority: priority.map(signal),
    lowConfidence: lowConfidence.map(signal),
    recent: analyzed.slice(0, 30).map(signal),
    modules: [
      ["Perfil adaptativo", "Ajusta tom e profundidade de resposta", true],
      ["Urgência e sentimento", "Prioriza reclamações e riscos", true],
      ["Score de oportunidade", "Ordena leads por intenção de compra", true],
      ["Detector de objeções", "Reconhece preço, tempo, confiança e agenda", true],
      ["Resumo inteligente", "Mantém o contexto em todas as telas", true],
      ["Próxima melhor ação", "Recomenda o avanço mais seguro", true],
      ["Handoff preventivo", "Pausa a IA em reclamações prioritárias", true],
      ["Auditoria de confiança", "Localiza respostas que precisam evoluir", true],
      ["Detecção de anomalias", "Monitora silêncio, fila e sentimento", true],
      ["Copiloto executivo", "Transforma dados em leitura operacional", isCerebrasConfigured()],
      ["Áudio inteligente", "Transcreve e responde dúvidas em voz", Boolean(process.env.GROQ_API_KEY)],
      ["Recuperação de entrega", "Preserva mensagens para reenvio", true],
    ].map(([name, description, active]) => ({ name: String(name), description: String(description), active: Boolean(active) })),
    weekActivity: analyzed.filter((item) => item.session.lastMessageAt && item.session.lastMessageAt >= weekAgo).length,
  };
}
