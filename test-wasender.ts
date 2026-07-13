/**
 * Script de teste para Wasender API
 * Execute: npx tsx test-wasender.ts
 */

import { config } from "dotenv";

// Carregar variáveis de ambiente do .env
config();

async function testWasenderAPI() {
  console.log("🧪 Testando Wasender API...\n");

  // Verificar configuração
  const apiKey = process.env.WASENDER_API_KEY;
  const baseUrl = process.env.WASENDER_BASE_URL || "https://api.wasender.com.br";

  console.log("📋 Configuração:");
  console.log("- API Key:", apiKey ? "✅ Configurada" : "❌ Não configurada");
  console.log("- Base URL:", baseUrl);
  console.log();

  if (!apiKey) {
    console.error("❌ ERRO: WASENDER_API_KEY não está configurada no .env");
    console.log("💡 Adicione ao seu arquivo .env:");
    console.log("   WASENDER_API_KEY=sua_chave_aqui");
    return;
  }

  // Número de teste (substitua pelo seu número real)
  const testNumber = "5511944400696"; // +55 11 94440-0696
  const testMessage = "✅ Teste do Wasender API - Número correto! " + new Date().toLocaleString("pt-BR");

  console.log("📱 Enviando mensagem de teste:");
  console.log("- Para:", testNumber);
  console.log("- Mensagem:", testMessage);
  console.log();

  try {
    const response = await fetch(`${baseUrl}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: testNumber,
        text: testMessage,
      }),
    });

    console.log("📊 Status da resposta:", response.status, response.statusText);

    const data = await response.json();
    console.log("📄 Resposta:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("\n✅ SUCESSO! Mensagem enviada com sucesso!");
    } else {
      console.log("\n❌ ERRO: A API retornou um erro");
      console.log("💡 Verifique:");
      console.log("   1. Se a API Key está correta");
      console.log("   2. Se o número de telefone está correto e ativo no WhatsApp");
      console.log("   3. Se a sua conta Wasender está ativa");
    }
  } catch (error) {
    console.error("\n❌ ERRO ao fazer requisição:", error);
    console.log("💡 Verifique:");
    console.log("   1. Se a URL da API está correta");
    console.log("   2. Se você tem conexão com a internet");
  }
}

// Executar teste
testWasenderAPI();
