import { config } from "dotenv";
config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PHONE = "5511972851072";

async function createSessionModel() {
  try {
    console.log("🔄 Criando sessão para:", TEST_PHONE);
    
    const session = await prisma.whatsAppSession.create({
      data: {
        phone: TEST_PHONE,
        metadata: { 
          stage: "ETAPA4_VEHICLE", 
          welcomed: true,
          customerName: "João",
          vehicleCollectStep: "model"
        }
      }
    });
    
    console.log("✅ Sessão criada:", session.phone);
    console.log("   Stage inicial:", session.metadata?.stage);
    console.log("   vehicleCollectStep:", session.metadata?.vehicleCollectStep);
    
  } catch (error) {
    console.error("❌ Erro ao criar sessão:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createSessionModel();
