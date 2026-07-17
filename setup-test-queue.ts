import { prisma } from "./src/lib/prisma";

async function setupTestQueue() {
  await prisma.outboundMessageQueue.deleteMany({});
  console.log("🧹 Fila limpa\n");

  // Inserir 5 mensagens de teste
  for (let i = 1; i <= 5; i++) {
    await prisma.outboundMessageQueue.create({
      data: {
        phone: `551197285107${i}`,
        body: { text: `Mensagem de teste ${i}` },
        attempts: 0,
        maxAttempts: 3,
        scheduledFor: new Date(),
        isDailyLimit: false,
      }
    });
  }
  console.log("📥 5 mensagens de teste inseridas na fila");

  const count = await prisma.outboundMessageQueue.count();
  console.log(`Total na fila: ${count}`);

  await prisma.$disconnect();
}

setupTestQueue()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erro:", error);
    process.exit(1);
  });
