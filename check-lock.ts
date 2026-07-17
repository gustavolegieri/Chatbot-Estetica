import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PHONE = "5511972851072";

async function checkLock() {
  try {
    console.log("🔍 Verificando lock atual para:", TEST_PHONE);
    
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone: TEST_PHONE },
      select: {
        phone: true,
        processingLockedAt: true,
        metadata: true
      }
    });
    
    if (!session) {
      console.log("❌ Sessão não encontrada");
      return;
    }
    
    console.log("📊 Status da sessão:");
    console.log("   Telefone:", session.phone);
    console.log("   Lock em:", session.processingLockedAt);
    console.log("   Stage:", session.metadata?.stage);
    
    if (session.processingLockedAt) {
      const now = new Date();
      const lockAge = now.getTime() - new Date(session.processingLockedAt).getTime();
      console.log("   Idade do lock:", Math.floor(lockAge / 1000), "segundos");
      
      if (lockAge > 15000) {
        console.log("⚠️  Lock expirado (> 15s), liberando...");
        await prisma.whatsAppSession.update({
          where: { phone: TEST_PHONE },
          data: { processingLockedAt: null }
        });
        console.log("✅ Lock liberado");
      } else {
        console.log("🔒 Lock ainda válido");
      }
    } else {
      console.log("✅ Nenhum lock ativo");
    }
    
  } catch (error) {
    console.error("❌ Erro ao verificar lock:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLock();
