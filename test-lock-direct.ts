import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testLockDirect() {
  console.log("🧪 Testando lock distribuído diretamente no banco...");
  
  const TEST_PHONE = "5511972851072";
  const LOCK_TIMEOUT_MS = 15_000;
  
  try {
    // Limpar qualquer lock existente
    await prisma.whatsAppSession.updateMany({
      where: { phone: TEST_PHONE },
      data: { processingLockedAt: null }
    });
    
    console.log("📋 Teste 1: Adquirir lock pela primeira vez");
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    
    const result1 = await prisma.whatsAppSession.updateMany({
      where: {
        phone: TEST_PHONE,
        OR: [
          { processingLockedAt: null },
          { processingLockedAt: { lt: staleThreshold } },
        ],
      },
      data: { processingLockedAt: now },
    });
    
    console.log(`📝 Resultado 1: ${result1.count} sessões atualizadas`);
    
    if (result1.count === 0) {
      console.log("❌ Não conseguiu adquirir lock (pode não existir sessão)");
      // Criar sessão de teste
      await prisma.whatsAppSession.upsert({
        where: { phone: TEST_PHONE },
        create: {
          phone: TEST_PHONE,
          metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: false }
        },
        update: {}
      });
      
      console.log("📝 Sessão criada, tentando novamente...");
      const resultRetry = await prisma.whatsAppSession.updateMany({
        where: {
          phone: TEST_PHONE,
          OR: [
            { processingLockedAt: null },
            { processingLockedAt: { lt: staleThreshold } },
          ],
        },
        data: { processingLockedAt: now },
      });
      console.log(`📝 Resultado retry: ${resultRetry.count} sessões atualizadas`);
    }
    
    console.log("📋 Teste 2: Tentar adquirir lock novamente (deve falhar)");
    const result2 = await prisma.whatsAppSession.updateMany({
      where: {
        phone: TEST_PHONE,
        OR: [
          { processingLockedAt: null },
          { processingLockedAt: { lt: staleThreshold } },
        ],
      },
      data: { processingLockedAt: new Date() },
    });
    
    console.log(`📝 Resultado 2: ${result2.count} sessões atualizadas`);
    
    if (result2.count === 0) {
      console.log("✅ Lock funcionou - segunda tentativa foi bloqueada");
    } else {
      console.log("❌ Lock não funcionou - segunda tentativa conseguiu adquirir lock");
    }
    
    console.log("📋 Teste 3: Liberar lock");
    await prisma.whatsAppSession.update({
      where: { phone: TEST_PHONE },
      data: { processingLockedAt: null }
    });
    console.log("✅ Lock liberado");
    
    console.log("📋 Teste 4: Tentar adquirir lock após liberação (deve funcionar)");
    const result3 = await prisma.whatsAppSession.updateMany({
      where: {
        phone: TEST_PHONE,
        OR: [
          { processingLockedAt: null },
          { processingLockedAt: { lt: staleThreshold } },
        ],
      },
      data: { processingLockedAt: new Date() },
    });
    
    console.log(`📝 Resultado 3: ${result3.count} sessões atualizadas`);
    
    if (result3.count > 0) {
      console.log("✅ Lock funcionou - conseguiu adquirir após liberação");
    } else {
      console.log("❌ Lock não funcionou - não conseguiu adquirir após liberação");
    }
    
    // Limpar
    await prisma.whatsAppSession.update({
      where: { phone: TEST_PHONE },
      data: { processingLockedAt: null }
    });
    
  } catch (error) {
    console.error("❌ Erro no teste:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testLockDirect();
