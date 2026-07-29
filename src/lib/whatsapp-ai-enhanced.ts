/**
 * Enhanced AI Functions for WhatsApp Flow
 * Utiliza Cerebras API para melhorar a experiência do cliente
 */

import { cerebrasChat, isCerebrasConfigured, parseJsonFromModel } from "./cerebras-ai";
import { CATALOG } from "./whatsapp-catalog";
import type { FlowState } from "./whatsapp-flow-types";
import type { FlowContext } from "./whatsapp-flow-messages";
import type { WhatsAppCatalogContext } from "./whatsapp-service-catalog";

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

export interface IntentAnalysis {
  intent: "schedule" | "reschedule" | "cancel" | "doubt" | "schedule_or_doubt" | "other" | "greeting";
  urgency?: "high" | "medium" | "low";
  suggestedService?: string;
  reason?: string;
}

export interface VehicleAnalysis {
  model?: string;
  year?: string;
  color?: string;
  condition?: string;
  isSuv?: boolean;
  hasData: boolean;
}

export interface HandoffSummary {
  clientName: string;
  service?: string;
  vehicle?: string;
  intention: string;
  urgency: "high" | "medium" | "low";
  history: string;
  conversationLength: number;
}

export interface FeedbackSummary {
  rating: number;
  feedback?: string;
  positive: string[];
  negative?: string[];
  suggestions?: string[];
}

export const AI_FEATURES = {
  INTENT_DETECTION: "intent_detection",
  VEHICLE_PARSING: "vehicle_parsing",
  INDECISIVE_ANALYSIS: "indecisive_analysis",
  NAVIGATION_DETECTION: "navigation_detection",
  URGENCY_DETECTION: "urgency_detection",
  HUMAN_HANDOFF: "human_handoff",
  RESUMO_ORDEM: "resumo_ordem",
  CONFIRMACAO_CLARA: "confirmacao_clara",
  ERRO_AMIGAVEL: "erro_amigavel",
  FAQ_CUSTOMIZADO: "faq_customizado",
  AGENDAMENTO_EXISTENTE: "agendamento_existente",
  REPETIR_ULTIMA_MSG: "repetir_ultima_msg",
  FEEDBACK_POS: "feedback_pos",
  RESUMO_ATENDENTE: "resumo_atendente",
} as const;

/**
 * 1. Intent Detection com IA (versão aprimorada)
 * Detecta agendar, reagendar, cancelar, dúvida, etc.
 */
export async function analyzeIntentAIV2(
  text: string,
  flowStage?: string
): Promise<IntentAnalysis | null> {
  const prompt = `
Você é um assistente inteligente de atendimento ao cliente. Analise a mensagem do cliente e determine a intenção principal.

Orientações:
- Se o cliente falar sobre agendar, remarcar ou mudar horário → INTENÇÃO: "schedule"
- Se o cliente falar sobre cancelar, desistir ou não quer → INTENÇÃO: "cancel"
- Se o cliente tiver dúvida ou pergunta → INTENÇÃO: "doubt"
- Se cliente não souber o que quer ou estiver indeciso → INTENÇÃO: "schedule_or_doubt"
- Se cliente só saudar ou falar sobre o bot → INTENÇÃO: "greeting"
- Se cliente quer falar com atendente → INTENÇÃO: "other"

Etapa atual: ${flowStage || "não informada"}
Msg do cliente: "${text}"

Responda em JSON:
{
  "intent": "schedule|reschedule|cancel|doubt|schedule_or_doubt|other|greeting",
  "urgency": "high|medium|low",
  "reason": "motivação curta (1-2 palavras)",
  "suggestedService": "nome do serviço sugerido (apenas se houver dúvida indecisa)"
}
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 200,
    temperature: 0.1,
  });

  if (!response) return null;

  const result = parseJsonFromModel<IntentAnalysis>(response);
  if (!result) return null;

  return {
    intent: result.intent || "other",
    urgency: result.urgency || "medium",
    reason: result.reason,
    suggestedService: result.suggestedService,
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
  return raw.replace(/^['"]|['"]$/g, "").trim().slice(0, 900) || null;
}

/**
 * 2. Parsing Inteligente de Veículo com IA
 * Extrai modelo, ano, cor e condição de texto natural
 */
export async function parseVehicleAI(text: string): Promise<VehicleAnalysis | null> {
  const prompt = `
Você é um assistente de análise automotiva. Extraia informações de veículo de uma mensagem.

Msg do cliente: "${text}"

Responda em JSON:
{
  "model": "modelo do veículo (ex: Hilux, Onix, Cobalt) ou null",
  "year": "ano do veículo (ex: 2021, 2022) ou null",
  "color": "cor do veículo (ex: preto, branco, prata) ou null",
  "condition": "estado (ex: novo, seminovo, usado, batido, arranhado, riscado) ou null",
  "isSuv": "boolean - true se parece SUV/CUV (ex: tiggo, hb20, Tucson)",
  "hasData": "boolean - true se encontrou alguma informação válida"
}

Regras:
- Use null quando não tiver informação
- Inclua o ano mesmo que seja com parênteses (ex: "(2021)")
- "novo", "seminovo", "usado" são estados válidos
- "novo", "limpo", "banho", "lavado" NÃO são estados
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 300,
    temperature: 0.1,
  });

  if (!response) return null;

  const result = parseJsonFromModel<VehicleAnalysis>(response);
  if (!result) return null;

  return {
    model: result.model || undefined,
    year: result.year || undefined,
    color: result.color || undefined,
    condition: result.condition || undefined,
    isSuv: result.isSuv || false,
    hasData: result.hasData || false,
  };
}

/**
 * 3. Análise de Cliente Indeciso com IA
 * Sugere serviço com base no que o cliente escreveu
 */
export async function analyzeIndecisiveClient(text: string): Promise<string | null> {
  const prompt = `
Você é um especialista em vendas de estética automotiva. Analise o que o cliente escreveu e sugira um serviço ideal.

Msg do cliente: "${text}"

Responda em JSON:
{
  "suggestedService": "nome do serviço que mais combina com o cliente (apenas o nome)",
  "reason": "1 frase explicando por que este serviço é o melhor (50-80 palavras)"
}

Disponíveis (curto nome para sugestão):
- lavagem_simples, lavagem_completa, lavagem_detalhada
- limpeza_motor, cristalizacao_farois
- descontaminacao_pintura, descontaminacao_vidro
- higienizacao_couro_completa, higienizacao_couro, higienizacao_tecido_completa, higienizacao_tecido
- polimento_cotacao
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 400,
    temperature: 0.3,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ suggestedService?: string; reason?: string }>(response);
  if (!result?.suggestedService) return null;

  return result.suggestedService;
}

/**
 * 4. Detecção de Navegação Inteligente
 * Detecta comandos como "voltar", "editar", "repetir", "menu"
 */
export async function detectNavigationCommand(text: string): Promise<{
  command: "back" | "edit" | "repeat" | "menu" | "restart" | null;
  target?: string;
} | null> {
  const prompt = `
Identifique comandos de navegação em uma mensagem de cliente.

Msg: "${text}"

Responda em JSON:
{
  "command": "back|edit|repeat|menu|restart|null",
  "target": "qual elemento quer editar (ex: 'serviço', 'data', 'horário') ou null"
}

Comandos possíveis:
- "voltar", "volta", "return" → back
- "editar", "trocar", "mudar" → edit
- "repetir", "reenviar", "repete" → repeat
- "menu", "voltar pro menu" → menu
- "reiniciar", "começar de novo", "resetar" → restart
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 150,
    temperature: 0.1,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{
    command: "back" | "edit" | "repeat" | "menu" | "restart" | null;
    target?: string;
  }>(response);

  return result || null;
}

/**
 * 5. Detecção de Urgência com IA
 * Identifica se o cliente está com pressa
 */
export async function detectUrgency(text: string): Promise<"high" | "medium" | "low" | null> {
  const prompt = `
Identifique o nível de urgência da solicitação do cliente.

Msg: "${text}"

Responda em JSON:
{
  "urgency": "high|medium|low"
}

Palavras que indicam alta urgência: "urgente", "preciso", "hoje", "agora", "já", "dentro de", "preciso fazer", "hoje mesmo"
Palavras que indicam baixa urgência: "depois", "quando puder", "um dia qualquer", "bem", "gostaria"
Ambas ou nenhuma → medium
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 100,
    temperature: 0.1,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ urgency: "high" | "medium" | "low" }>(response);
  if (!result) return null;

  return result.urgency;
}

/**
 * 6. Handoff para Atendente com IA
 * Gera resumo completo da conversa
 */
export async function generateHandoffSummary(
  context: {
    clientName: string;
    service?: string;
    vehicle?: string;
    intention: string;
    history: string[];
    stage?: string;
  }
): Promise<HandoffSummary> {
  const prompt = `
Você é um assistente que gera resumos estruturados para humanos. Crie um resumo detalhado e estruturado.

Dados:
- Nome: ${context.clientName}
- Serviço interessado: ${context.service || "Não informado"}
- Veículo: ${context.vehicle || "Não informado"}
- Intenção principal: ${context.intention}
- Histórico de mensagens: ${context.history.slice(-5).join(" | ")}
- Etapa atual: ${context.stage || "Não informado"}

Responda em JSON:
{
  "clientName": "nome do cliente",
  "service": "serviço mencionado ou null",
  "vehicle": "informações do veículo ou null",
  "intention": "intenção principal da conversa",
  "urgency": "high|medium|low",
  "history": "histórico resumido (2-3 frases)",
  "conversationLength": "quantidade de mensagens",
  "nextSteps": "2-3 sugestões de ações para o atendente"
}
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 400,
    temperature: 0.2,
  });

  if (!response) {
    return {
      clientName: context.clientName,
      service: context.service,
      vehicle: context.vehicle,
      intention: context.intention,
      urgency: "medium",
      history: context.history.slice(-3).join(" | "),
      conversationLength: context.history.length,
    };
  }

  return parseJsonFromModel<HandoffSummary>(response) || {
    clientName: context.clientName,
    service: context.service,
    vehicle: context.vehicle,
    intention: context.intention,
    urgency: "medium",
    history: context.history.slice(-3).join(" | "),
    conversationLength: context.history.length,
  };
}

/**
 * 7. Resumo Automático do Pedido (antes da confirmação)
 */
export async function generateOrderSummary(flow: {
  customerName: string;
  serviceLabel: string;
  vehicleDisplay: string;
  day?: string;
  time?: string;
  quoteMin?: number;
  quoteMax?: number;
}): Promise<string | null> {
  const prompt = `
Crie um resumo claro e formatado de um agendamento antes da confirmação.

Dados:
- Cliente: ${flow.customerName}
- Serviço: ${flow.serviceLabel}
- Veículo: ${flow.vehicleDisplay}
- Data: ${flow.day || "a definir"}
- Hora: ${flow.time || "a definir"}
- Orçamento: ${flow.quoteMin || flow.quoteMax ? `R$ ${flow.quoteMin} - R$ ${flow.quoteMax}` : "a definir"}

Responda em JSON:
{
  "summary": "texto formatado do resumo (max 200 palavras)"
}

Formato: data/hora na primeira linha, detalhes na segunda, chamada para confirmação na terceira
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 400,
    temperature: 0.3,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ summary?: string }>(response);
  return result?.summary || null;
}

/**
 * 8. Confirmação Clara com IA
 * Formata a mensagem de confirmação com todos os detalhes
 */
export async function generateConfirmationMessage(flow: {
  name: string;
  service: string;
  vehicle: string;
  day: string;
  time: string;
  address: string;
  hours: string;
}): Promise<string | null> {
  const prompt = `
Crie uma mensagem de confirmação de agendamento clara, amigável e completa.

Dados:
- Cliente: ${flow.name}
- Serviço: ${flow.service}
- Veículo: ${flow.vehicle}
- Data: ${flow.day}
- Hora: ${flow.time}
- Endereço: ${flow.address}
- Horário funcionamento: ${flow.hours}

Responda em JSON:
{
  "message": "mensagem de confirmação completa (max 300 palavras)"
}

Use emojis para tornar a mensagem mais amigável e use negrito para destacar informações importantes.
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 500,
    temperature: 0.5,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ message?: string }>(response);
  return result?.message || null;
}

/**
 * 9. Tratamento de Erro Amigável
 * Responde quando há erro ou texto incompreendido
 */
export async function generateFriendlyError(text: string, context: {
  flowStage?: string;
  lastService?: string;
}): Promise<string | null> {
  const prompt = `
Você é um atendente simpático. O cliente escreveu algo que você não entendeu ou deu um erro.

Msg do cliente: "${text}"
Etapa atual: ${context.flowStage || "não informado"}
Último serviço mencionado: ${context.lastService || "não informado"}

Responda em JSON:
{
  "message": "mensagem amigável pedindo que o cliente repita ou tente novamente (max 150 palavras)"
}

Use emojis e tente não ser repetitivo. Explique como pode ajudar.
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 300,
    temperature: 0.7,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ message?: string }>(response);
  return result?.message || null;
}

/**
 * 10. Detecção de "Já tenho agendamento"
 */
export async function detectExistingAppointment(text: string): Promise<boolean> {
  const prompt = `
Identifique se o cliente está perguntando sobre um agendamento existente.

Msg: "${text}"

Responda em JSON:
{
  "hasAppointmentQuery": true|false
}

Palavras: "já tenho agendamento", "quero saber", "meu agendamento", "meu horário", "quando chega", "meu dia"
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 100,
    temperature: 0.1,
  });

  if (!response) return false;

  const result = parseJsonFromModel<{ hasAppointmentQuery?: boolean }>(response);
  return result?.hasAppointmentQuery || false;
}

/**
 * 11. Feedback Pós-Atendimento
 */
export async function generateFeedbackRequest(): Promise<string | null> {
  const prompt = `
Crie uma mensagem de solicitação de feedback pós-atendimento.

Responda em JSON:
{
  "message": "mensagem amigável pedindo avaliação de 5 estrelas com opção de comentário"
}

Use emojis e seja agradável. Ofereça uma opção para feedback aberto.
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 200,
    temperature: 0.6,
  });

  if (!response) return null;

  const result = parseJsonFromModel<{ message?: string }>(response);
  return result?.message || null;
}

/**
 * 12. Resumo para Atendente (para WhatsApp)
 */
export async function generateWhatsAppSummary(handoff: {
  clientName: string;
  service?: string;
  vehicle?: string;
  intention: string;
  urgency: string;
  history: string;
  conversationLength: number;
}): Promise<string> {
  const prompt = `
Crie um resumo formatado para WhatsApp enviado ao atendente.

Dados:
- Nome: ${handoff.clientName}
- Serviço: ${handoff.service || "não informado"}
- Veículo: ${handoff.vehicle || "não informado"}
- Intenção: ${handoff.intention}
- Urgência: ${handoff.urgency}
- Histórico: ${handoff.history}
- Mensagens: ${handoff.conversationLength}

Responda em JSON:
{
  "summary": "texto formatado com emojis, pronto para enviar no WhatsApp"
}

Use padrão WhatsApp (line breaks com newlines). Destaque urgência.
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 300,
    temperature: 0.3,
  });

  if (!response) {
    return `📞 Novo atendimento para ${handoff.clientName}\n\n` +
           `🎯 Intenção: ${handoff.intention}\n` +
           `⏰ Urgência: ${handoff.urgency}\n` +
           `📜 Histórico: ${handoff.history}\n` +
           `💬 Mensagens: ${handoff.conversationLength}`;
  }

  const result = parseJsonFromModel<{ summary?: string }>(response);
  return result?.summary || "";
}

/**
 * 13. Avaliação de Feedback com IA
 */
export async function analyzeFeedback(feedback: string): Promise<{
  rating: number;
  positive: string[];
  negative: string[];
  suggestions: string[];
} | null> {
  const prompt = `
Analyze feedback de cliente e extraia informações estruturadas.

Feedback: "${feedback}"

Responda em JSON:
{
  "rating": 1-5,
  "positive": ["ponto positivo 1", "ponto positivo 2"],
  "negative": ["ponto negativo 1", "ponto negativo 2"],
  "suggestions": ["sugestão 1", "sugestão 2"]
}

Se feedback for muito curto ou não tiver pontuação clara, rating=5 e arrays vazios.
`;

  const response = await cerebrasChat({
    system: prompt,
    user: "",
    maxTokens: 300,
    temperature: 0.1,
  });

  if (!response) return null;

  return parseJsonFromModel<{
    rating: number;
    positive: string[];
    negative: string[];
    suggestions: string[];
  }>(response);
}

export interface QuickReplyOption {
  id: string;
  label: string;
  description?: string;
}

export interface AiUsageEvent {
  feature: string;
  used: boolean;
  fallback?: boolean;
}

export function buildQuickReplyOptions(context: {
  intent?: IntentAnalysis["intent"] | null;
  urgency?: IntentAnalysis["urgency"] | null;
  hasAppointment?: boolean;
  serviceLabel?: string;
}): QuickReplyOption[] {
  const options: QuickReplyOption[] = [];

  if (context.hasAppointment) {
    options.push(
      { id: "appointment_view", label: "Ver agendamento" },
      { id: "appointment_reschedule", label: "Remarcar" },
      { id: "appointment_cancel", label: "Cancelar" }
    );
  }

  if (context.intent === "doubt" || context.intent === "schedule_or_doubt") {
    options.push(
      { id: "service_confirm", label: "Confirmar serviço" },
      { id: "service_edit", label: "Editar serviço" }
    );
  }

  if (context.urgency === "high") {
    options.push(
      { id: "priority_next", label: "Próximo horário" },
      { id: "priority_human", label: "Falar com atendente" }
    );
  }

  if (context.serviceLabel) {
    options.push({ id: "repeat_service", label: `Repetir ${context.serviceLabel}` });
  }

  if (!options.length) {
    options.push(
      { id: "menu_back", label: "Voltar ao menu" },
      { id: "menu_repeat", label: "Repetir mensagem" }
    );
  }

  return options.slice(0, 4);
}

export function buildRepeatLastMessagePrompt(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  if (!clean) return "Claro! Posso repetir a última mensagem.";
  return `Claro! Aqui está novamente:\n\n${clean}`;
}

export function buildAppointmentStatusReply(hasAppointment: boolean): string {
  if (!hasAppointment) {
    return "Não encontrei um agendamento ativo. Se quiser, posso ajudar a agendar do zero.";
  }
  return "Encontrei seu agendamento. Posso te mostrar os detalhes, remarcar ou cancelar.";
}

export function buildAiUsageSnapshot(events: AiUsageEvent[]): {
  total: number;
  used: number;
  fallbacks: number;
  byFeature: Record<string, { used: number; fallbacks: number }>;
} {
  const snapshot = {
    total: events.length,
    used: events.filter((event) => event.used).length,
    fallbacks: events.filter((event) => event.fallback).length,
    byFeature: {} as Record<string, { used: number; fallbacks: number }>,
  };

  for (const event of events) {
    const current = snapshot.byFeature[event.feature] ?? { used: 0, fallbacks: 0 };
    if (event.used) current.used += 1;
    if (event.fallback) current.fallbacks += 1;
    snapshot.byFeature[event.feature] = current;
  }

  return snapshot;
}

export function buildCancellationReasonPrompt(reason?: string): string {
  const base = "Se quiser, me diga o motivo do cancelamento para eu registrar e tentar melhorar seu atendimento.";
  return reason?.trim() ? `${base}\n\nMotivo informado: ${reason.trim()}` : base;
}

export function buildReschedulePrompt(nextSlots: string[]): string {
  if (!nextSlots.length) {
    return "Não encontrei novos horários disponíveis agora. Posso avisar quando abrir uma vaga.";
  }
  return [`Encontrei estes horários para reagendar:`, ...nextSlots.map((slot) => `• ${slot}`)].join("\n");
}
