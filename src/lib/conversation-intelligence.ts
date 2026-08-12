import { cerebrasChat, isCerebrasConfigured, parseJsonFromModel } from "./cerebras-ai";
import type { FlowState } from "./whatsapp-flow-types";

export type AiSentiment = "positive" | "neutral" | "negative";
export type AiUrgency = "low" | "medium" | "high" | "critical";
export type AiTone = "concise" | "consultative" | "reassuring";
export type AiIntent = "price" | "schedule" | "service" | "complaint" | "payment" | "cancel" | "praise" | "other";
export type AiObjection = "price" | "time" | "trust" | "availability" | "none";

export interface ConversationIntelligence {
  sentiment: AiSentiment;
  urgency: AiUrgency;
  tone: AiTone;
  intent: AiIntent;
  objection: AiObjection;
  leadScore: number;
  confidence: number;
  needsHuman: boolean;
  nextAction: string;
  summary: string;
  riskSignals: string[];
  source: "rules" | "cerebras";
  analyzedAt: string;
  messageCount: number;
}

const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

function normalized(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function analyzeConversationRules(text: string, previous?: Partial<ConversationIntelligence>): ConversationIntelligence {
  const raw = text.trim();
  const value = normalized(raw);
  const complaint = /reclam|pessim|horriv|estrag|danific|riscaram|mancharam|engan|absurdo|processo|procon|nunca mais|nao gostei/.test(value);
  const explicitHuman = /falar com (alguem|atendente|responsavel|gerente)|quero (um )?(atendente|humano)|chama(r)? (o )?(responsavel|gerente)/.test(value);
  const danger = /acidente|fogo|incend|ameaca|machuc|roub|furto|policia/.test(value);
  const negative = complaint || /bravo|irritad|chatead|decepcion|demorando|atrasad|nao responde|problema/.test(value);
  const positive = /obrigad|valeu|perfeito|excelente|adorei|gostei|parabens|incrivel|top demais/.test(value);
  const schedule = /agend|marcar|horario|vaga|amanha|hoje|sabado|segunda|terça|terca|quarta|quinta|sexta/.test(value);
  const price = /preco|valor|quanto|custa|caro|barato|desconto|orcamento/.test(value);
  const payment = /pix|cartao|pagamento|paguei|comprovante|dinheiro/.test(value);
  const cancel = /cancel|desmarc|nao vou conseguir|remarcar/.test(value);
  const trust = /garantia|funciona mesmo|resultado|confiavel|seguro|certeza/.test(value);
  const time = /demora|duracao|tempo|rapido|horas/.test(value);
  const availability = /tem vaga|disponivel|disponibilidade|encaixe/.test(value);
  const service = /lavagem|polimento|vitrific|higien|banco|motor|pintura|farol|detalh/.test(value);
  const decisive = schedule || price || service || payment;

  const urgency: AiUrgency = danger ? "critical" : complaint || explicitHuman || previous?.needsHuman ? "high" : /urgente|agora|hoje ainda|o quanto antes/.test(value) ? "high" : schedule || cancel ? "medium" : "low";
  const intent: AiIntent = complaint || (explicitHuman && previous?.sentiment === "negative") ? "complaint" : cancel ? "cancel" : payment ? "payment" : schedule ? "schedule" : price ? "price" : service ? "service" : positive ? "praise" : "other";
  const objection: AiObjection = /caro|preco|valor|desconto/.test(value) ? "price" : time ? "time" : trust ? "trust" : availability ? "availability" : "none";
  const scoreBase = previous?.leadScore ?? 24;
  const leadScore = clamp(scoreBase * 0.45 + (schedule ? 34 : 0) + (service ? 18 : 0) + (price ? 15 : 0) + (decisive ? 14 : 0) - (complaint ? 18 : 0));
  const riskSignals = [danger ? "segurança" : "", complaint ? "insatisfação" : "", cancel ? "cancelamento" : "", negative ? "sentimento negativo" : ""].filter(Boolean);

  return {
    sentiment: negative ? "negative" : positive ? "positive" : "neutral",
    urgency,
    tone: negative || trust ? "reassuring" : raw.length < 38 ? "concise" : "consultative",
    intent,
    objection,
    leadScore,
    confidence: clamp(decisive || complaint ? 88 : 68),
    needsHuman: danger || complaint || explicitHuman || Boolean(previous?.needsHuman),
    nextAction: complaint || explicitHuman || previous?.needsHuman ? "Acolher, resumir o problema e transferir para a equipe" : schedule ? "Conduzir diretamente para serviço e agenda" : price ? "Identificar serviço e veículo antes de apresentar valor" : payment ? "Validar a etapa de pagamento sem alterar a escolha" : service ? "Explicar o benefício e oferecer agendamento" : "Responder de forma útil e manter o contexto",
    summary: raw.slice(0, 180) || previous?.summary || "Mensagem sem conteúdo textual",
    riskSignals,
    source: "rules",
    analyzedAt: new Date().toISOString(),
    messageCount: (previous?.messageCount ?? 0) + 1,
  };
}

interface AiJson {
  sentiment?: AiSentiment;
  urgency?: AiUrgency;
  tone?: AiTone;
  intent?: AiIntent;
  objection?: AiObjection;
  leadScore?: number;
  confidence?: number;
  needsHuman?: boolean;
  nextAction?: string;
  summary?: string;
  riskSignals?: string[];
}

export async function analyzeConversationWithAI(text: string, flow: FlowState, base: ConversationIntelligence): Promise<ConversationIntelligence> {
  if (!isCerebrasConfigured() || text.trim().length < 8) return base;

  const system = `Você classifica uma conversa de uma estética automotiva. Seja conservador: needsHuman=true somente para reclamação real, risco, ameaça, dano, cobrança sensível ou cliente claramente irritado. Não invente fatos. Responda somente JSON.
Campos: sentiment positive|neutral|negative; urgency low|medium|high|critical; tone concise|consultative|reassuring; intent price|schedule|service|complaint|payment|cancel|praise|other; objection price|time|trust|availability|none; leadScore 0-100; confidence 0-100; needsHuman boolean; nextAction até 100 caracteres; summary até 160 caracteres; riskSignals array.`;
  const user = `Etapa: ${flow.stage}\nCliente: ${flow.customerName || "não identificado"}\nServiço: ${flow.serviceLabel || "não definido"}\nVeículo: ${flow.vehicleRaw || flow.vehicleModel || "não definido"}\nMensagem: ${text}`;

  const aiPromise = cerebrasChat({ system, user, maxTokens: 320, temperature: 0.1 });
  const raw = await Promise.race<string | null>([
    aiPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 1_600)),
  ]);
  if (!raw) return base;
  const parsed = parseJsonFromModel<AiJson>(raw);
  if (!parsed) return base;

  const validSentiment = new Set(["positive", "neutral", "negative"]);
  const validUrgency = new Set(["low", "medium", "high", "critical"]);
  const validTone = new Set(["concise", "consultative", "reassuring"]);
  const validIntent = new Set(["price", "schedule", "service", "complaint", "payment", "cancel", "praise", "other"]);
  const validObjection = new Set(["price", "time", "trust", "availability", "none"]);
  const urgency = validUrgency.has(parsed.urgency || "") ? parsed.urgency! : base.urgency;
  const intent = validIntent.has(parsed.intent || "") ? parsed.intent! : base.intent;
  const safeHuman = Boolean(parsed.needsHuman) && (urgency === "high" || urgency === "critical") && (intent === "complaint" || base.needsHuman);

  return {
    ...base,
    sentiment: validSentiment.has(parsed.sentiment || "") ? parsed.sentiment! : base.sentiment,
    urgency,
    tone: validTone.has(parsed.tone || "") ? parsed.tone! : base.tone,
    intent,
    objection: validObjection.has(parsed.objection || "") ? parsed.objection! : base.objection,
    leadScore: clamp(Number(parsed.leadScore ?? base.leadScore)),
    confidence: clamp(Number(parsed.confidence ?? base.confidence)),
    needsHuman: base.needsHuman || safeHuman,
    nextAction: asText(parsed.nextAction).slice(0, 120) || base.nextAction,
    summary: asText(parsed.summary).slice(0, 180) || base.summary,
    riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals.map(asText).filter(Boolean).slice(0, 5) : base.riskSignals,
    source: "cerebras",
    analyzedAt: new Date().toISOString(),
  };
}

export function intelligencePromptContext(value?: Partial<ConversationIntelligence>) {
  if (!value) return "";
  return `\nContexto de atendimento detectado: tom ${value.tone || "consultivo"}; intenção ${value.intent || "não definida"}; objeção ${value.objection || "nenhuma"}; urgência ${value.urgency || "baixa"}. Adapte a resposta a esse perfil sem mencionar esta análise.`;
}
