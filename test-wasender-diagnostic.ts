/**
 * Script de diagnóstico para WasenderAPI
 * Execute: npx tsx test-wasender-diagnostic.ts
 */

import { config } from "dotenv";

// Carregar variáveis de ambiente do .env
config();

const API_KEY = process.env.WASENDER_API_KEY;
const BASE_URL = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";
const TEST_PHONE = "5511972851072";

async function testWasenderDiagnostic() {
  console.log("🔍 Diagnóstico WasenderAPI\n");

  // Verificar configuração
  console.log("📋 Configuração:");
  console.log("- API Key:", API_KEY ? "✅ Configurada" : "❌ Não configurada");
  console.log("- Base URL:", BASE_URL);
  console.log("- Test Phone:", TEST_PHONE);
  console.log();

  if (!API_KEY) {
    console.error("❌ ERRO: WASENDER_API_KEY não está configurada");
    return;
  }

  // Teste 1: Verificar saldo/status da conta
  console.log("📊 Teste 1: Verificando status da conta...");
  try {
    const response = await fetch(`${BASE_URL}/status`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    });

    console.log("Status:", response.status);
    if (response.ok) {
      const data = await response.json();
      console.log("Dados:", JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log("Erro:", text);
    }
  } catch (error) {
    console.log("Erro ao verificar status:", error);
  }
  console.log();

  // Teste 2: Enviar mensagem simples
  console.log("📱 Teste 2: Enviando mensagem simples...");
  try {
    const response = await fetch(`${BASE_URL}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        to: `+${TEST_PHONE}`,
        text: `🧪 Teste de diagnóstico WasenderAPI - ${new Date().toLocaleString("pt-BR")}`
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
    console.log("Erro ao enviar mensagem:", error);
  }
  console.log();

  // Teste 3: Verificar instância/sessão
  console.log("🔌 Teste 3: Verificando instância...");
  try {
    const response = await fetch(`${BASE_URL}/instance/status`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${API_KEY}`
      }
    });

    console.log("Status:", response.status);
    if (response.ok) {
      const data = await response.json();
      console.log("Dados:", JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log("Erro:", text);
    }
  } catch (error) {
    console.log("Erro ao verificar instância:", error);
  }
}

testWasenderDiagnostic();