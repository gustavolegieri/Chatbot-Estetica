import { addDays, endOfDay, startOfDay, subDays, subHours } from "date-fns";
import { prisma } from "./prisma";
import { analyzeConversationRules } from "./conversation-intelligence";
import { flowStageLabel } from "./flow-stage-labels";
import type { FlowState } from "./whatsapp-flow-types";

const STAGES = [
  "ETAPA1_AWAITING_NAME", "ETAPA2_MAIN_MENU", "ETAPA2_SUB", "ETAPA3_SERVICE_ACTION",
  "ETAPA4_VEHICLE", "ETAPA5_QUOTE", "ETAPA6_UPSELL", "ETAPA7_DAY", "ETAPA7_TIME",
  "ETAPA10_LOGISTICS", "ETAPA8_PAYMENT", "ETAPA14_REMINDER", "ETAPA15_SUMMARY_CONFIRM", "ETAPA16_CONFIRMATION",
] as const;

function flowOf(value: unknown): FlowState {
  return value && typeof value === "object" && !Array.isArray(value) ? value as FlowState : { stage: "ETAPA1_AWAITING_NAME" };
}

function moneyValue(appointment: { finalPrice: unknown; service: { price: unknown } }) {
  return Number(appointment.finalPrice ?? appointment.service.price ?? 0);
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function getFlowSuiteReport() {
  const now = new Date();
  const since90 = subDays(now, 90);
  const since30 = subDays(now, 30);
  const staleAt = subHours(now, 2);
  const monthEnd = endOfDay(addDays(now, 30));

  const [sessions, messages, appointments, transitions, prompts, hours, settings, queue, versions, campaigns] = await Promise.all([
    prisma.whatsAppSession.findMany({
      where: { updatedAt: { gte: since90 }, NOT: [{ phone: "" }, { phone: { startsWith: "test-" } }] },
      include: { client: true, messages: { orderBy: { createdAt: "desc" }, take: 16 } },
      orderBy: { lastMessageAt: "desc" }, take: 350,
    }),
    prisma.whatsAppMessage.findMany({ where: { createdAt: { gte: since30 } }, orderBy: { createdAt: "asc" }, take: 5000 }),
    prisma.appointment.findMany({ where: { date: { gte: since90, lte: monthEnd } }, include: { client: true, service: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.stageTransition.findMany({ where: { timestamp: { gte: since30 } }, orderBy: { timestamp: "desc" }, take: 3000 }),
    prisma.botPrompt.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }] }),
    prisma.businessHour.findMany({ where: { settingsId: "default" }, orderBy: { dayOfWeek: "asc" } }),
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.outboundMessageQueue.findMany({ where: { processedAt: null }, select: { id: true, attempts: true, isDailyLimit: true, error: true, scheduledFor: true }, take: 200 }),
    prisma.auditLog.findMany({ where: { action: { in: ["FLOW_PROMPT_VERSION_CREATED", "FLOW_PROMPT_RESET"] } }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const rows = sessions.map((session) => {
    const flow = flowOf(session.metadata);
    const intelligence = flow.aiIntelligence ?? analyzeConversationRules(session.lastMessagePreview ?? "");
    return { session, flow, intelligence };
  });

  const stageCounts = new Map<string, number>();
  for (const row of rows) stageCounts.set(row.flow.stage || row.session.lastStage || "ETAPA1_AWAITING_NAME", (stageCounts.get(row.flow.stage || row.session.lastStage || "ETAPA1_AWAITING_NAME") ?? 0) + 1);
  const stageTraffic = new Map<string, number>();
  for (const transition of transitions) stageTraffic.set(transition.stage, (stageTraffic.get(transition.stage) ?? 0) + 1);
  const maxTraffic = Math.max(1, ...stageTraffic.values());
  const flowMap = STAGES.map((stage, index) => {
    const active = stageCounts.get(stage) ?? 0;
    const traffic = stageTraffic.get(stage) ?? 0;
    const stalled = rows.filter((row) => row.flow.stage === stage && (row.session.lastMessageAt ?? row.session.updatedAt) < staleAt && !row.flow.awaitingPostConfirmationReturn).length;
    return {
      id: stage,
      label: flowStageLabel(stage),
      active,
      traffic,
      stalled,
      heat: Math.round((traffic / maxTraffic) * 100),
      next: index < STAGES.length - 1 ? [STAGES[index + 1]] : [],
      status: stalled > 2 ? "critical" : stalled > 0 ? "warning" : "healthy",
    };
  });

  const milestones = {
    started: rows.length,
    service: rows.filter((row) => Boolean(row.flow.serviceKey || row.flow.serviceLabel || row.session.selectedServiceId)).length,
    vehicle: rows.filter((row) => Boolean(row.flow.vehicleRaw || row.flow.vehicleModel || row.session.client?.vehicleModel)).length,
    calendar: rows.filter((row) => Boolean(row.flow.dayDate || row.session.selectedDate)).length,
    time: rows.filter((row) => Boolean(row.flow.startTime || row.session.selectedTime)).length,
    confirmed: new Set(appointments.filter((item) => item.source.toLowerCase().includes("whatsapp") && !["CANCELLED", "NO_SHOW"].includes(item.status)).map((item) => item.clientId)).size,
  };
  const funnel = Object.entries(milestones).map(([id, count], index, all) => ({
    id,
    label: ({ started: "Iniciaram", service: "Escolheram serviço", vehicle: "Informaram veículo", calendar: "Abriram agenda", time: "Escolheram horário", confirmed: "Confirmaram" } as Record<string, string>)[id],
    count,
    conversion: index === 0 ? 100 : Math.round((count / Math.max(1, all[0][1] as number)) * 100),
    dropoff: index === 0 ? 0 : Math.max(0, (all[index - 1][1] as number) - count),
  }));

  const unanswered = messages.filter((message) => message.direction === "INBOUND" && message.sessionId && message.flowStage !== "WEBHOOK_DEDUP" && (/\?|quanto|qual|como|quando|tem hor[aá]rio|valor|pre[cç]o/i.test(message.body))).filter((message) => {
    const next = messages.find((candidate) => candidate.phone === message.phone && candidate.direction === "OUTBOUND" && candidate.createdAt > message.createdAt);
    return !next || next.createdAt.getTime() - message.createdAt.getTime() > 10 * 60_000;
  }).slice(-30).reverse().map((message) => ({ id: message.id, phone: message.phone, question: message.body, stage: message.flowStage, at: message.createdAt, suggestion: `Responder diretamente e oferecer continuidade a partir de ${flowStageLabel(message.flowStage)}.` }));

  const recoveries = rows.filter((row) => {
    const last = row.session.lastMessageAt ?? row.session.updatedAt;
    const hasFuture = appointments.some((item) => item.clientId === row.session.clientId && item.date >= startOfDay(now) && !["CANCELLED", "NO_SHOW"].includes(item.status));
    return last < staleAt && !hasFuture && !row.flow.awaitingPostConfirmationReturn && row.flow.stage !== "ETAPA16_CONFIRMATION";
  }).slice(0, 30).map((row) => ({
    id: row.session.id, phone: row.session.phone, name: row.session.client?.name ?? row.flow.customerName ?? "Cliente",
    stage: row.flow.stage, stageLabel: flowStageLabel(row.flow.stage), lastMessageAt: row.session.lastMessageAt,
    service: row.flow.serviceLabel ?? null, vehicle: row.flow.vehicleRaw ?? row.session.client?.vehicleModel ?? null,
    message: `Oi, ${row.session.client?.name ?? row.flow.customerName ?? "tudo bem"}? Seu atendimento ficou em ${flowStageLabel(row.flow.stage).toLowerCase()}. Posso continuar exatamente de onde paramos.`
  }));

  const auditFindings = [
    ...(flowMap.some((item) => item.stalled > 0) ? [{ severity: "warning", title: "Clientes parados no fluxo", detail: `${flowMap.reduce((sum, item) => sum + item.stalled, 0)} conversa(s) estão há mais de duas horas na mesma etapa.`, action: "Usar a recuperação contextual." }] : []),
    ...(unanswered.length ? [{ severity: "critical", title: "Perguntas sem resposta rápida", detail: `${unanswered.length} dúvida(s) levaram mais de dez minutos para receber retorno.`, action: "Adicionar conhecimento ou revisar disponibilidade da IA." }] : []),
    ...(queue.length ? [{ severity: "warning", title: "Fila de saída acumulada", detail: `${queue.length} mensagem(ns) aguardam envio.`, action: "Verificar limite e conexão da WASender." }] : []),
    ...(prompts.filter((prompt) => prompt.content.length < 35).length ? [{ severity: "info", title: "Mensagens curtas demais", detail: `${prompts.filter((prompt) => prompt.content.length < 35).length} texto(s) podem não orientar o cliente com clareza.`, action: "Revisar no editor visual." }] : []),
  ];
  if (!auditFindings.length) auditFindings.push({ severity: "healthy", title: "Fluxo consistente", detail: "Nenhum caminho crítico foi detectado nesta análise.", action: "Continuar acompanhando a conversão." });

  const futureAppointments = appointments.filter((item) => item.date >= startOfDay(now) && !["CANCELLED", "NO_SHOW"].includes(item.status));
  const schedule = Array.from({ length: 7 }, (_, offset) => {
    const day = addDays(startOfDay(now), offset);
    const iso = dateKey(day);
    const weekday = Number(day.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Sao_Paulo" }) === "Sun" ? 0 : day.getDay());
    const config = hours.find((item) => item.dayOfWeek === weekday);
    const open = config?.openTime ?? settings?.businessHoursStart ?? "08:00";
    let closeMin = toMinutes(config?.closeTime ?? settings?.businessHoursEnd ?? "18:00");
    if (closeMin === 0) closeMin = 24 * 60;
    const slotDuration = settings?.slotDurationMin ?? 60;
    const slots = config?.isOpen === false ? [] : Array.from({ length: Math.max(0, Math.floor((closeMin - toMinutes(open)) / slotDuration)) }, (_, i) => timeFromMinutes(toMinutes(open) + i * slotDuration));
    const booked = futureAppointments.filter((item) => dateKey(item.date) === iso);
    const occupied = new Set(booked.flatMap((item) => slots.filter((slot) => slot >= item.startTime && slot < item.endTime)));
    return { date: iso, label: day.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }), total: slots.length, occupied: occupied.size, free: Math.max(0, slots.length - occupied.size), occupancy: slots.length ? Math.round((occupied.size / slots.length) * 100) : 0, bestSlots: slots.filter((slot) => !occupied.has(slot)).slice(0, 4) };
  });

  const next7 = futureAppointments.filter((item) => item.date <= endOfDay(addDays(now, 7)));
  const next30 = futureAppointments.filter((item) => item.date <= monthEnd);
  const forecast = {
    week: next7.reduce((sum, item) => sum + moneyValue(item), 0),
    month: next30.reduce((sum, item) => sum + moneyValue(item), 0),
    confirmedWeek: next7.filter((item) => item.clientConfirmedAt).reduce((sum, item) => sum + moneyValue(item), 0),
    risk: next30.filter((item) => !item.clientConfirmedAt && item.status === "PENDING").reduce((sum, item) => sum + moneyValue(item), 0),
  };

  const appointmentClientIds = new Set(futureAppointments.map((item) => item.clientId));
  const commercial = {
    new: rows.filter((row) => row.flow.stage === "ETAPA1_AWAITING_NAME").length,
    interested: rows.filter((row) => Boolean(row.flow.serviceKey || row.flow.serviceLabel) && !row.flow.quoteMin).length,
    quote: rows.filter((row) => Boolean(row.flow.quoteMin) && !appointmentClientIds.has(row.session.clientId ?? "")).length,
    scheduled: futureAppointments.length,
    served: appointments.filter((item) => item.status === "COMPLETED" && item.date >= since30).length,
    lost: rows.filter((row) => Boolean(row.session.abandonmentAt)).length + appointments.filter((item) => ["CANCELLED", "NO_SHOW"].includes(item.status) && item.date >= since30).length,
  };

  const opportunities = rows.filter((row) => !appointmentClientIds.has(row.session.clientId ?? "")).sort((a, b) => b.intelligence.leadScore - a.intelligence.leadScore).slice(0, 30).map((row) => ({
    id: row.session.id, phone: row.session.phone, name: row.session.client?.name ?? row.flow.customerName ?? "Novo contato", score: row.intelligence.leadScore,
    intent: row.intelligence.intent, objection: row.intelligence.objection, reason: row.intelligence.summary, nextAction: row.intelligence.nextAction,
    service: row.flow.serviceLabel ?? null, vehicle: row.flow.vehicleRaw ?? row.session.client?.vehicleModel ?? null,
  }));

  const completed30 = appointments.filter((item) => item.status === "COMPLETED" && item.date >= since30);
  const feedbackMessages = messages.filter((message) => message.direction === "INBOUND" && /nota|avalia|excelente|adorei|gostei|ruim|péssim|problema/i.test(message.body));
  const reputation = {
    eligible: completed30.length,
    requested: messages.filter((message) => message.direction === "OUTBOUND" && /avalia[cç][aã]o|google|nota de 1 a 5/i.test(message.body)).length,
    positive: feedbackMessages.filter((message) => /excelente|adorei|gostei|ótimo|perfeito|nota 5/i.test(message.body)).length,
    negative: feedbackMessages.filter((message) => /ruim|péssim|problema|nota [12]/i.test(message.body)).length,
    candidates: completed30.filter((item) => !messages.some((message) => message.phone === item.client.phone && message.direction === "OUTBOUND" && message.createdAt > item.date && /avalia[cç][aã]o|google|nota/i.test(message.body))).slice(0, 20).map((item) => ({ id: item.id, name: item.client.name, phone: item.client.phone, service: item.service.name, date: item.date })),
  };

  const analyzedRows = rows.filter((row) => row.session.lastMessagePreview);
  const aiPerformance = {
    analyzed: analyzedRows.length,
    averageConfidence: analyzedRows.length ? Math.round(analyzedRows.reduce((sum, row) => sum + row.intelligence.confidence, 0) / analyzedRows.length) : 0,
    averageScore: analyzedRows.length ? Math.round(analyzedRows.reduce((sum, row) => sum + row.intelligence.leadScore, 0) / analyzedRows.length) : 0,
    resolvedAutomatically: rows.filter((row) => row.session.handoffStatus === "NONE" && !row.session.botPaused).length,
    handoffs: rows.filter((row) => row.session.handoffStatus !== "NONE" || row.session.botPaused).length,
    lowConfidence: analyzedRows.filter((row) => row.intelligence.confidence < 65).length,
    unanswered: unanswered.length,
    topics: Array.from(analyzedRows.reduce((map, row) => map.set(row.intelligence.intent, (map.get(row.intelligence.intent) ?? 0) + 1), new Map<string, number>())).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };

  const envHealth = [
    { id: "wasender", name: "WASender", active: Boolean(process.env.WASENDER_API_KEY), detail: queue.some((item) => item.isDailyLimit) ? "Limite diário detectado" : `${queue.length} na fila` },
    { id: "cerebras", name: "Cerebras", active: Boolean(process.env.CEREBRAS_API_KEY), detail: "Raciocínio e respostas" },
    { id: "groq", name: "Groq / áudio", active: Boolean(process.env.GROQ_API_KEY), detail: "Transcrição de voz" },
    { id: "database", name: "Banco de dados", active: true, detail: `${sessions.length} sessões carregadas` },
    { id: "webhook", name: "Webhook", active: messages.some((item) => item.createdAt >= subHours(now, 24)), detail: `${messages.filter((item) => item.createdAt >= subHours(now, 24)).length} eventos em 24h` },
    { id: "cron", name: "Automações", active: Boolean(process.env.CRON_SECRET), detail: "Auditoria, lembretes e recuperação" },
    { id: "push", name: "Notificações PWA", active: Boolean(process.env.VAPID_PUBLIC_KEY || process.env.JWT_SECRET), detail: "Alertas operacionais" },
  ];

  const byVariant = (["A", "B"] as const).map((variant) => {
    const variantRows = rows.filter((row) => row.flow.abWelcomeVariant === variant);
    const ids = new Set(variantRows.map((row) => row.session.clientId).filter(Boolean));
    const converted = new Set(appointments.filter((item) => ids.has(item.clientId)).map((item) => item.clientId)).size;
    return { variant, sessions: variantRows.length, converted, rate: variantRows.length ? Math.round((converted / variantRows.length) * 100) : 0, winner: false };
  });
  const bestRate = Math.max(...byVariant.map((item) => item.rate));
  byVariant.forEach((item) => { item.winner = item.sessions >= 5 && item.rate === bestRate; });

  const client360 = rows.filter((row) => row.session.client).slice(0, 40).map((row) => {
    const clientAppointments = appointments.filter((item) => item.clientId === row.session.clientId);
    return { id: row.session.client!.id, name: row.session.client!.name, phone: row.session.phone, vehicle: row.session.client!.vehicleModel, plate: row.session.client!.vehiclePlate, email: row.session.client!.email, score: row.intelligence.leadScore, sentiment: row.intelligence.sentiment, summary: row.intelligence.summary, nextAction: row.intelligence.nextAction, appointments: clientAppointments.length, spent: clientAppointments.filter((item) => item.status === "COMPLETED").reduce((sum, item) => sum + moneyValue(item), 0), lastService: clientAppointments.at(-1)?.service.name ?? row.flow.serviceLabel ?? null, href: `/admin/atendimento?phone=${encodeURIComponent(row.session.phone)}` };
  });

  const replays = rows.slice(0, 25).map((row) => ({ id: row.session.id, phone: row.session.phone, name: row.session.client?.name ?? row.flow.customerName ?? "Cliente", stage: flowStageLabel(row.flow.stage), messages: [...row.session.messages].reverse().map((message) => ({ id: message.id, direction: message.direction, sender: message.sender, body: message.body, stage: message.flowStage, at: message.createdAt })), intelligence: row.intelligence }));

  const campaignIdeas = [
    { id: "abandoned", title: "Retomar atendimentos interrompidos", audience: recoveries.length, bestTime: "Hoje, 17:30", offer: "Continuidade sem reiniciar o cadastro", message: "Oi, {name}! Seu atendimento ficou quase pronto. Posso continuar exatamente de onde paramos e encontrar um horário para você." },
    { id: "completed", title: "Manutenção pós-serviço", audience: completed30.length, bestTime: "Terça-feira, 10:30", offer: "Revisão do cuidado recomendado", message: "Oi, {name}! Já está na hora de conferir como está o cuidado do seu veículo. Posso sugerir a melhor manutenção e horários disponíveis." },
    { id: "price", title: "Recuperar objeções de preço", audience: opportunities.filter((item) => item.objection === "price").length, bestTime: "Quinta-feira, 18:00", offer: "Opção compatível com o objetivo e orçamento", message: "Oi, {name}! Separei uma alternativa de cuidado para o seu veículo que pode encaixar melhor no que você procura. Quer conhecer?" },
  ];

  return {
    generatedAt: now.toISOString(), flowMap, funnel, commercial, schedule, forecast, opportunities, recoveries, unanswered,
    auditFindings, reputation, aiPerformance, health: envHealth, abTest: byVariant, client360, replays, campaignIdeas,
    prompts: prompts.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
    versions: versions.map((item) => ({ id: item.id, action: item.action, resource: item.resource, data: item.data, createdAt: item.createdAt })),
    campaigns: campaigns.map((item) => ({ id: item.id, name: item.name, status: item.status, sent: item.successCount, failed: item.failCount, total: item.totalRecipients, createdAt: item.createdAt })),
  };
}
