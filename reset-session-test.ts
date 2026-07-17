import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetSession() {
  const phone = "5511972851072";
  
  console.log(`Resetando sessão para o telefone ${phone}...`);
  
  // Delete WhatsAppSession
  const deletedSession = await prisma.whatsAppSession.deleteMany({
    where: { phone }
  });
  
  console.log(`Deletadas ${deletedSession.count} sessões`);
  
  await prisma.$disconnect();
  process.exit(0);
}

resetSession().catch(console.error);
