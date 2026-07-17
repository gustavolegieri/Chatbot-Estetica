import { prisma } from "./src/lib/prisma";

async function checkQueueErrors() {
  const allMessages = await prisma.outboundMessageQueue.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 10
  });

  console.log("=== Últimas 10 mensagens na fila ===");
  allMessages.forEach((msg, i) => {
    console.log(`\n${i + 1}. ID: ${msg.id}`);
    console.log(`   Phone: ${msg.phone}`);
    console.log(`   ProcessedAt: ${msg.processedAt || 'null'}`);
    console.log(`   Error: ${msg.error || 'null'}`);
    console.log(`   Attempts: ${msg.attempts}`);
    console.log(`   ClaimedBy: ${msg.claimedBy || 'null'}`);
  });

  await prisma.$disconnect();
}

checkQueueErrors()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Erro:", error);
    process.exit(1);
  });
