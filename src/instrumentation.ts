/**
 * Aquece o modelo local na inicialização do servidor. Assim, o custo de
 * carregar o modelo na GPU acontece antes da primeira conversa do WhatsApp.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OLLAMA_ENABLED?.trim().toLowerCase() !== "true") return;

  const baseUrl = (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b-instruct";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: -1,
        messages: [{ role: "user", content: "Responda apenas: pronto" }],
        options: { num_predict: 4, num_ctx: 4096, temperature: 0 },
      }),
    });
    if (!response.ok) {
      console.warn("[Ollama Local] Aquecimento não concluído:", response.status);
    } else {
      console.info(`[Ollama Local] ${model} aquecido e pronto.`);
    }
  } catch (error) {
    console.warn("[Ollama Local] Servidor não disponível durante o aquecimento:", error);
  } finally {
    clearTimeout(timeout);
  }
}
