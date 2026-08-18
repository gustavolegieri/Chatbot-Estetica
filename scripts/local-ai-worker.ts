import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const OLLAMA_URL = (process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:3b-instruct";
const POLL_MS = 350;
let stopping = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const { prisma } = await import("../src/lib/prisma");
  console.info(`[IA Local] Worker iniciado com ${OLLAMA_MODEL}.`);

  await prisma.localAiJob.updateMany({
    where: {
      status: "PROCESSING",
      claimedAt: { lt: new Date(Date.now() - 2 * 60_000) },
    },
    data: { status: "PENDING", claimedAt: null },
  });

  while (!stopping) {
    const now = new Date();
    const job = await prisma.localAiJob.findFirst({
      where: { status: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      await wait(POLL_MS);
      continue;
    }

    const claimed = await prisma.localAiJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING", claimedAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          stream: false,
          keep_alive: -1,
          messages: [
            { role: "system", content: job.system },
            { role: "user", content: job.user },
          ],
          options: {
            temperature: job.temperature,
            num_predict: job.maxTokens,
            num_ctx: 4096,
          },
        }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
      const data = (await response.json()) as { message?: { content?: string } };
      const answer = data.message?.content?.trim();
      if (!answer) throw new Error("Ollama retornou uma resposta vazia");

      await prisma.localAiJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", response: answer, completedAt: new Date(), error: null },
      });
      console.info(`[IA Local] Job ${job.id} concluído.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.localAiJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: message.slice(0, 500), completedAt: new Date() },
      });
      console.error(`[IA Local] Job ${job.id} falhou:`, message);
    }

    if (Math.random() < 0.02) {
      await prisma.localAiJob.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
      });
    }
  }

  await prisma.$disconnect();
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

run().catch((error) => {
  console.error("[IA Local] Worker encerrado por erro:", error);
  process.exitCode = 1;
});
