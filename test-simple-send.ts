/**
 * Teste simples de envio via WasenderAPI
 * Execute: npx tsx test-simple-send.ts
 */

import { config } from "dotenv";

// Carregar variáveis de ambiente do .env
config();

const API_KEY = process.env.WASENDER_API_KEY;
const BASE_URL = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";
const TEST_PHONE = "5511972851072";

async function testSimpleSend() {
  console.log("🧪 Teste simples de envio WasenderAPI\n");

  console.log("📋 Configuração:");
  console.log("- API Key:", API_KEY ? "✅ Configurada" : "❌ Não configurada");
  console.log("- Base URL:", BASE_URL);
  console.log("- Test Phone:", TEST_PHONE);
  console.log();

  if (!API_KEY) {
    console.error("❌ ERRO: WASENDER_API_KEY não está configurada");
    return;
  }

  // Teste de envio simples
  console.log("📱 Enviando mensagem simples...");
  try {
    const payload = {
      to: `+${TEST_PHONE}`,
      text: `🧪 Teste simples - ${new Date().toLocaleString("pt-BR")}`
    };

    console.log("Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(`${BASE_URL}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    console.log("Status HTTP:", response.status, response.statusText);

    const data = await response.json();
    console.log("Resposta:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("✅ Mensagem enviada com sucesso!");
    } else {
      console.log("❌ Erro ao enviar mensagem");
    }
  } catch (error) {
    console.error("❌ Erro na requisição:", error);
  }
}

testSimpleSend();