import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PHONE = "5511972851072";

async function checkSessionGeneral() {
  try {
    console.log("🔍 Verificando estado geral da sessão para:", TEST_PHONE);
    
    const session = await prisma.whatsAppSession.findUnique({
      where: { phone: TEST_PHONE },
      select: {
        phone: true,
        metadata: true
      }
    });
    
    if (!session) {
      console.log("❌ Sessão não encontrada");
      return;
    }
    
    console.log("📊 Estado geral do fluxo:");
    console.log("   Stage:", session.metadata?.stage);
    console.log("   vehicleCollectStep:", session.metadata?.vehicleCollectStep);
    console.log("   vehicleModel:", session.metadata?.vehicleModel);
    console.log("   vehicleYear:", session.metadata?.vehicleYear);
    console.log("   vehicleColor:", session.metadata?.vehicleColor);
    console.log("   vehicleCondition:", session.metadata?.vehicleCondition);
    console.log("   vehicleConfirmed:", session.metadata?.vehicleConfirmed);
    console.log("   customerName:", session.metadata?.customerName);
    console.log("   selectedCategory:", session.metadata?.selectedCategory);
    console.log("   selectedService:", session.metadata?.selectedService);
    
  } catch (error) {
    console.error("❌ Erro ao verificar estado:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSessionGeneral();
