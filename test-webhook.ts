/**
 * Script de teste para webhook do WhatsApp
 * Simula uma mensagem do Wasender API
 * Execute: npx tsx test-webhook.ts
 */

import { config } from "dotenv";

// Carregar variáveis de ambiente do .env
config();

async function testWebhook() {
  console.log("🧪 Testando webhook do WhatsApp...\n");

  const webhookUrl = "https://chatbot-estetica-ten.vercel.app/api/whatsapp/webhook";
  const webhookSecret = process.env.WASENDER_WEBHOOK_SECRET;

  console.log("📋 Configuração:");
  console.log("- Webhook URL:", webhookUrl);
  console.log("- Webhook Secret:", webhookSecret ? "✅ Configurada" : "❌ Não configurada");
  console.log();

  // Payload simulado do Wasender API
  const payload = {
    event: "messages.received",
    data: {
      key: {
        remoteJid: "5511944400696@s.whatsapp.net",
        fromMe: false,
        cleanedSenderPn: "5511944400696",
        senderPn: "5511944400696",
      },
      message: {
        conversation: "Teste do webhook",
      },
      pushName: "Cliente Teste",
      messageBody: "Teste do webhook",
    },
  };

  console.log("📤 Enviando payload simulado:");
  console.log(JSON.stringify(payload, null, 2));
  console.log();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": webhookSecret || "",
      },
      body: JSON.stringify(payload),
    });

    console.log("📊 Status da resposta:", response.status, response.statusText);

    const data = await response.json();
    console.log("📄 Resposta:", JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log("\n✅ SUCESSO! Webhook está funcionando!");
      console.log("💡 O bot deve ter processado a mensagem e enviado uma resposta.");
    } else {
      console.log("\n❌ ERRO: O webhook retornou um erro");
      console.log("💡 Verifique os logs do Vercel para mais detalhes");
    }
  } catch (error) {
    console.error("\n❌ ERRO ao fazer requisição:", error);
    console.log("💡 Verifique:");
    console.log("   1. Se a URL do webhook está correta");
    console.log("   2. Se o projeto está rodando no Vercel");
    console.log("   3. Se você tem conexão com a internet");
  }
}

// Executar teste
testWebhook();
