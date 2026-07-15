/**
 * Script para enviar apenas a imagem do calendário para teste
 * Execute: npx tsx test-send-calendar.ts
 */

import { config } from "dotenv";
import { sendCalendarWithImageAndList } from "./src/lib/calendar-helper";
import { sendMedia } from "./src/lib/evolution-api";

// Carregar variáveis de ambiente
config();

async function testSendCalendar() {
  console.log("🧪 Testando envio de calendário\n");

  const phone = "5511972851072"; // Substitua pelo seu número
  
  console.log("📱 Enviando calendário para:", phone);
  console.log("🔄 Gerando calendário...\n");

  try {
    // Opção 1: Enviar calendário completo (imagem + lista)
    console.log("Opção 1: Calendário completo (imagem + lista)");
    await sendCalendarWithImageAndList({ number: phone });
    console.log("✅ Calendário completo enviado!");
    
    // Opção 2: Enviar apenas a imagem (se preferir)
    // console.log("\nOpção 2: Apenas imagem");
    // const imageUrl = await generateCalendarImageOnly();
    // await sendMedia({ 
    //   number: phone, 
    //   mediaUrl: imageUrl, 
    //   caption: "📅 Calendário de disponibilidade (teste)" 
    // });
    // console.log("✅ Imagem enviada!");
    
  } catch (error) {
    console.error("❌ Erro ao enviar calendário:", error);
  }
}

testSendCalendar();