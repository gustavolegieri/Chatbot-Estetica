/**
 * Script de teste com espera automática para rate limit
 * Execute: npx tsx test-calendar-with-wait.ts
 */

import { config } from "dotenv";

// Carregar variáveis de ambiente do .env
config();

const API_KEY = process.env.WASENDER_API_KEY;
const BASE_URL = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";
const TEST_PHONE = "5511972851072";

function wait(seconds: number) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function testWithWait() {
  console.log("🧪 Teste com espera automática para rate limit\n");

  console.log("⏰ Aguardando 60 segundos para evitar rate limit...");
  await wait(60);
  console.log("✅ Tempo de espera concluído\n");

  console.log("📱 Enviando mensagem...");
  try {
    const response = await fetch(`${BASE_URL}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        to: `+${TEST_PHONE}`,
        text: `🧪 Teste após espera - ${new Date().toLocaleString("pt-BR")}`
      })
    });

    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Resposta:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("✅ Mensagem enviada com sucesso!");
    } else {
      console.log("❌ Erro ao enviar mensagem");
    }
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

testWithWait();