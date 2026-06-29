import { cerebrasChat, isCerebrasConfigured, parseJsonFromModel } from "./cerebras-ai";
import type { FlowStage, FlowState } from "./whatsapp-flow-types";
import type { FlowContext } from "./whatsapp-flow-messages";
import type { WhatsAppCatalogContext } from "./whatsapp-service-catalog";

export type MessageIntent =
  | "name"
  | "greeting"
  | "doubt"
  | "schedule"
  | "service"
  | "menu"
  | "small_talk"
  | "unclear";

export interface MessageAnalysis {
  intent: MessageIntent;
  extractedName?: string;
  reply?: string;
  menuNumber?: number;
}

interface AnalysisJson {
  intent?: string;
  extractedName?: string | null;
  reply?: string | null;
  menuNumber?: number | null;
}

const VALID_INTENTS = new Set<MessageIntent>([
  "name",
  "greeting",
  "doubt",
  "schedule",
  "service",
  "menu",
  "small_talk",
  "unclear",
]);

function buildServicesSummary(wctx: WhatsAppCatalogContext): string {
  const lines: string[] = [];
  for (const [num, cat] of Object.entries(wctx.categories)) {
    if (Number(num) === 8) continue;
    const items = cat.keys
      .filter((k) => k !== "indeciso" && k !== "pacotes")
      .map((k) => wctx.catalog[k]?.label)
      .filter(Boolean);
    if (items.length) lines.push(`${cat.title}: ${items.join(", ")}`);
  }
  return lines.join("\n");
}

function stageLabel(stage: FlowStage): string {
  const map: Partial<Record<FlowStage, string>> = {
    ETAPA1_AWAITING_NAME: "coletando o primeiro nome do cliente",
    ETAPA2_MAIN_MENU: "menu principal de serviços",
    ETAPA2_SUB: "submenu de categoria",
    ETAPA3_SERVICE_ACTION: "escolha após ver um serviço",
    ETAPA4_VEHICLE: "coletando dados do veículo",
    ETAPA5_QUOTE: "orçamento apresentado",
    ETAPA10_FAQ: "modo de dúvidas",
  };
  return map[stage] ?? stage;
}

export async function analyzeWhatsAppMessage(params: {
  text: string;
  stage: FlowStage;
  pushName?: string;
  customerName?: string;
  ctx: FlowContext;
}): Promise<MessageAnalysis | null> {
  if (!isCerebrasConfigured()) return null;

  const system = `Você analisa mensagens de clientes no WhatsApp da "${params.ctx.businessName}", estética automotiva premium.
Etapa atual: ${stageLabel(params.stage)}.
Horário: ${params.ctx.hours}. Endereço: ${params.ctx.address || "não informado"}.

REGRAS IMPORTANTES:
- "Oi", "Olá", "Bom dia", "Boa tarde", "E aí", "Tudo bem?" são SAUDAÇÕES (intent: greeting), NUNCA nomes.
- Nomes válidos: palavras de pessoa (ex: João, Maria, Carlos). Não aceite verbos, serviços ou frases inteiras como nome.
- Se o cliente fizer PERGUNTA ou tiver DÚVIDA (preço, tempo, garantia, formas de pagamento, etc.), use intent: doubt e inclua reply curta em português.
- Números sozinhos (1-8) em menu = intent: menu com menuNumber.
- Pedidos de agendamento = intent: schedule.
- Menção a serviço (lavagem, polimento, vitrificação...) = intent: service.

Responda SOMENTE JSON válido:
{"intent":"greeting|name|doubt|schedule|service|menu|small_talk|unclear","extractedName":null,"reply":null,"menuNumber":null}`;

  const user = [
    `Mensagem do cliente: "${params.text}"`,
    params.pushName ? `Nome no WhatsApp: ${params.pushName}` : null,
    params.customerName ? `Nome já salvo: ${params.customerName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await cerebrasChat({ system, user, maxTokens: 256, temperature: 0.1 });
  if (!raw) return null;

  const parsed = parseJsonFromModel<AnalysisJson>(raw);
  if (!parsed?.intent) return null;

  const intent = VALID_INTENTS.has(parsed.intent as MessageIntent)
    ? (parsed.intent as MessageIntent)
    : "unclear";

  return {
    intent,
    extractedName: parsed.extractedName?.trim() || undefined,
    reply: parsed.reply?.trim() || undefined,
    menuNumber:
      typeof parsed.menuNumber === "number" && parsed.menuNumber >= 1 && parsed.menuNumber <= 8
        ? parsed.menuNumber
        : undefined,
  };
}

export async function answerCustomerDoubt(params: {
  question: string;
  flow: FlowState;
  ctx: FlowContext;
  wctx: WhatsAppCatalogContext;
}): Promise<string | null> {
  if (!isCerebrasConfigured()) return null;

  const { flow, ctx, wctx, question } = params;
  const services = buildServicesSummary(wctx);

  const system = `Você é assistente virtual da "${ctx.businessName}", estética automotiva premium (Garagem do Ka).
Responda dúvidas de clientes no WhatsApp de forma amigável, objetiva e em português brasileiro.
Use emojis com moderação. Máximo 4 frases curtas. Formatação WhatsApp: *negrito* com asteriscos.

Informações:
- Horário: ${ctx.hours}
- Endereço: ${ctx.address || "consulte na recepção"}
${ctx.pixKey ? "- Aceita PIX, cartão e dinheiro" : "- Aceita cartão e dinheiro"}
- Serviços: ${services || "lavagem, polimento, vitrificação, higienização, pacotes"}
${flow.serviceLabel ? `- Serviço em discussão: ${flow.serviceLabel}` : ""}
${flow.estimatedTime ? `- Tempo estimado do serviço atual: ${flow.estimatedTime}` : ""}
${flow.quoteMin ? `- Faixa de preço atual: R$${flow.quoteMin} a R$${flow.quoteMax}` : ""}

Não invente preços exatos se não souber — diga que varia conforme veículo e estado.
Se a dúvida exigir o dono/equipe, sugira digitar *falar com o dono*.`;

  const raw = await cerebrasChat({
    system,
    user: `Dúvida do cliente: ${question}`,
    maxTokens: 400,
    temperature: 0.3,
  });

  if (!raw) return null;
  return raw.replace(/^["']|["']$/g, "").trim().slice(0, 900) || null;
}

/** Detecta se mensagem livre parece uma pergunta/dúvida */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 8) return false;
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|menu|voltar)\b/.test(t)) return false;
  return (
    t.includes("?") ||
    /^(como|quanto|qual|quais|onde|quando|por que|porque|vocês|voces|tem |dá |da |posso |consigo )/.test(
      t
    ) ||
    /dúvida|duvida|pergunta|gostaria de saber|queria saber|me explica|funciona|aceita|atende/.test(t)
  );
}
