import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PHONE = "5511972851072";

async function resetSession() {
  try {
    console.log("🔄 Resetando sessão do telefone:", TEST_PHONE);
    
    // Deletar sessão existente
    const deleted = await prisma.whatsAppSession.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    console.log(`✅ ${deleted.count} sessão(ões) deletada(s)`);
    
    // Deletar cliente associado (opcional)
    const deletedClient = await prisma.client.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    console.log(`✅ ${deletedClient.count} cliente(s) deletado(s)`);
    
    console.log("🚀 Sessão resetada com sucesso. Pode iniciar o teste do fluxo.");
    
  } catch (error) {
    console.error("❌ Erro ao resetar sessão:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetSession();
