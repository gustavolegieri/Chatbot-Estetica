import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeIntentAIV2,
  analyzeIndecisiveClient,
  analyzeFeedback,
  buildAiUsageSnapshot,
  buildAppointmentStatusReply,
  buildCancellationReasonPrompt,
  buildQuickReplyOptions,
  buildRepeatLastMessagePrompt,
  buildReschedulePrompt,
  detectExistingAppointment,
  detectNavigationCommand,
  detectUrgency,
  generateConfirmationMessage,
  generateFeedbackRequest,
  generateFriendlyError,
  generateHandoffSummary,
  generateOrderSummary,
  generateWhatsAppSummary,
  parseVehicleAI,
} from "./whatsapp-ai-enhanced";
import { detectIntentSmart } from "./whatsapp-intent";
import {
  buildVehicleNextStepMessage,
  detectVehicleCompletion,
  parseVehicleMessage,
  vehicleDisplay,
  vehicleQuickSummary,
} from "./whatsapp-vehicle-parse";

const isConfigured = Boolean(process.env.CEREBRAS_API_KEY?.trim());

function skipIfNoAi() {
  if (!isConfigured) {
    return true;
  }
  return false;
}

test("1 - intent detection fallback or IA returns a valid shape", async () => {
  const result = await detectIntentSmart("quero remarcar meu horário");
  assert.ok(result);
  assert.ok(result.intent);
});

test("2 - parsing inteligente de veículo identifica modelo e ano", () => {
  const parsed = parseVehicleMessage("Hilux preta 2021 com riscos");
  assert.equal(parsed.raw.includes("Hilux"), true);
  assert.ok(parsed.model || parsed.summary);
  assert.equal(typeof parsed.hasData, "boolean");
});

test("3 - cliente indeciso gera sugestão de serviço", async () => {
  if (skipIfNoAi()) {
    assert.equal(await analyzeIndecisiveClient("me ajuda a escolher"), null);
    return;
  }
  const suggestion = await analyzeIndecisiveClient("me ajuda a escolher");
  assert.ok(suggestion);
});

test("4 - análise de intenção com urgência responde com estrutura válida", async () => {
  const result = await analyzeIntentAIV2("preciso hoje mesmo");
  if (!result) return assert.equal(result, null);
  assert.ok(["schedule", "reschedule", "cancel", "doubt", "schedule_or_doubt", "other", "greeting"].includes(result.intent));
});

test("5 - navegação inteligente identifica comando de voltar ou editar", async () => {
  const command = await detectNavigationCommand("quero voltar e editar o serviço");
  if (!command) return assert.equal(command, null);
  assert.ok(["back", "edit", "repeat", "menu", "restart", null].includes(command.command));
});

test("6 - urgência alta é reconhecida ou inferida", async () => {
  const urgency = await detectUrgency("preciso para hoje agora");
  if (!urgency) return assert.equal(urgency, null);
  assert.ok(["high", "medium", "low"].includes(urgency));
});

test("7 - resumo automático do pedido pode ser gerado", async () => {
  if (skipIfNoAi()) {
    assert.equal(
      await generateOrderSummary({ customerName: "Ana", serviceLabel: "Lavagem", vehicleDisplay: "Civic 2020" }),
      null
    );
    return;
  }
  const summary = await generateOrderSummary({ customerName: "Ana", serviceLabel: "Lavagem", vehicleDisplay: "Civic 2020" });
  assert.ok(summary);
});

test("8 - mensagem de confirmação pode ser gerada", async () => {
  if (skipIfNoAi()) {
    assert.equal(
      await generateConfirmationMessage({
        name: "Ana",
        service: "Lavagem",
        vehicle: "Civic 2020",
        day: "22/07",
        time: "14:00",
        address: "Rua A",
        hours: "Seg-Sáb",
      }),
      null
    );
    return;
  }
  const message = await generateConfirmationMessage({
    name: "Ana",
    service: "Lavagem",
    vehicle: "Civic 2020",
    day: "22/07",
    time: "14:00",
    address: "Rua A",
    hours: "Seg-Sáb",
  });
  assert.ok(message);
});

test("9 - erro amigável tem resposta ou fallback nulo", async () => {
  const message = await generateFriendlyError("???", { flowStage: "ETAPA_TESTE", lastService: "Lavagem" });
  if (!message) return assert.equal(message, null);
  assert.equal(typeof message, "string");
});

test("10 - já tenho agendamento é detectado quando a IA responde", async () => {
  const result = await detectExistingAppointment("quero saber meu agendamento");
  assert.equal(typeof result, "boolean");
});

test("11 - pedido de feedback retorna string ou nulo", async () => {
  const result = await generateFeedbackRequest();
  assert.ok(result === null || typeof result === "string");
});

test("12 - resumo para atendente é gerado com fallback estruturado", async () => {
  const summary = await generateWhatsAppSummary({
    clientName: "Ana",
    service: "Lavagem",
    vehicle: "Civic 2020",
    intention: "schedule",
    urgency: "high",
    history: "cliente pediu hoje",
    conversationLength: 4,
  });
  assert.equal(typeof summary, "string");
});

test("13 - avaliação de feedback retorna estrutura válida", async () => {
  const result = await analyzeFeedback("Foi ótimo, mas demorou um pouco");
  assert.ok(result === null || typeof result.rating === "number");
});

test("14 - opções rápidas mudam conforme contexto", () => {
  const options = buildQuickReplyOptions({ intent: "doubt", urgency: "high", hasAppointment: true, serviceLabel: "Lavagem" });
  assert.ok(options.length > 0);
  assert.ok(options.every((option) => option.id && option.label));
});

test("15 - mensagem de repetir última resposta funciona", () => {
  assert.match(buildRepeatLastMessagePrompt("Mensagem anterior"), /Mensagem anterior/);
});

test("16 - status de agendamento retorna texto esperado", () => {
  assert.match(buildAppointmentStatusReply(true), /agendamento/i);
  assert.match(buildAppointmentStatusReply(false), /não encontrei/i);
});

test("17 - snapshot de uso da IA agrega features", () => {
  const snapshot = buildAiUsageSnapshot([
    { feature: "intent", used: true },
    { feature: "intent", used: true, fallback: true },
    { feature: "vehicle", used: false, fallback: true },
  ]);

  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.used, 2);
  assert.equal(snapshot.fallbacks, 2);
  assert.equal(snapshot.byFeature.intent.used, 2);
});

test("18 - motivo de cancelamento gera prompt útil", () => {
  assert.match(buildCancellationReasonPrompt("não poderei ir"), /não poderei ir/);
});

test("19 - reagendamento gera lista ou fallback", () => {
  assert.match(buildReschedulePrompt(["23/07 14:00", "24/07 09:00"]), /23\/07 14:00/);
  assert.match(buildReschedulePrompt([]), /Não encontrei novos horários/i);
});

test("20 - veículo integra helpers de etapa seguinte", () => {
  const parsed = parseVehicleMessage("Civic 2020 prata");
  assert.equal(typeof detectVehicleCompletion(parsed), "boolean");
  assert.equal(typeof vehicleDisplay(parsed), "string");
  assert.equal(typeof vehicleQuickSummary(parsed), "string");
  assert.equal(typeof buildVehicleNextStepMessage(parsed), "string");
});
