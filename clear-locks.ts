import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearLocks() {
  console.log("Limpando locks antigos...");
  
  // Clear processingLockedAt from all sessions
  const updated = await prisma.whatsAppSession.updateMany({
    where: { processingLockedAt: { not: null } },
    data: { processingLockedAt: null }
  });
  console.log(`Liberados ${updated.count} locks`);
  
  await prisma.$disconnect();
  process.exit(0);
}

clearLocks().catch(console.error);
