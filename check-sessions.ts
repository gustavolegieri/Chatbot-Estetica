import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSessions() {
  console.log("Verificando sessões...");
  
  const sessions = await prisma.whatsAppSession.findMany();
  console.log(`Total de sessões: ${sessions.length}`);
  
  for (const session of sessions) {
    console.log(`Phone: ${session.phone}, ProcessingLockedAt: ${session.processingLockedAt}`);
  }
  
  await prisma.$disconnect();
  process.exit(0);
}

checkSessions().catch(console.error);
