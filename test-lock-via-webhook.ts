import { config } from "dotenv";
config();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TEST_PHONE = "5511972851072";

async function testLockViaWebhook() {
  console.log("🧪 Testando lock distribuído via webhook...");
  console.log("📋 Disparando 2 mensagens simultâneas com <300ms de diferença");

  const message1 = "1";
  const message2 = "1";

  const startTime = Date.now();

  // Payload webhook
  const webhookPayload = {
    event: "messages.received",
    data: {
      messages: [
        {
          key: {
            remoteJid: `${TEST_PHONE}@s.whatsapp.net`,
            fromMe: false,
            id: `test-${Date.now()}-1`,
            timestamp: Math.floor(Date.now() / 1000)
          },
          message: {
            conversation: message1
          },
          pushName: "Test User 1"
        }
      ]
    }
  };

  // Dispara primeira mensagem
  const promise1 = fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-webhook-signature": process.env.WASENDER_WEBHOOK_SECRET || "test"
    },
    body: JSON.stringify(webhookPayload)
  });

  // Espera 200ms e dispara segunda mensagem
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const webhookPayload2 = {
    event: "messages.received",
    data: {
      messages: [
        {
          key: {
            remoteJid: `${TEST_PHONE}@s.whatsapp.net`,
            fromMe: false,
            id: `test-${Date.now()}-2`,
            timestamp: Math.floor(Date.now() / 1000)
          },
          message: {
            conversation: message2
          },
          pushName: "Test User 2"
        }
      ]
    }
  };

  const promise2 = fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-webhook-signature": process.env.WASENDER_WEBHOOK_SECRET || "test"
    },
    body: JSON.stringify(webhookPayload2)
  });

  // Aguarda ambas as requisições
  const [result1, result2] = await Promise.all([promise1, promise2]);

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log(`⏱️  Tempo total: ${duration}ms`);

  const data1 = await result1.json();
  const data2 = await result2.json();

  console.log("📝 Resultado da mensagem 1:", data1);
  console.log("📝 Resultado da mensagem 2:", data2);

  if (data1.ok && data2.ok) {
    console.log("✅ Ambas as mensagens foram processadas com sucesso");
    console.log("⚠️  Verifique os logs do servidor para ver se o lock funcionou");
    console.log("   Deve mostrar '[Lock] Mensagem ignorada — outra instância já está processando' em uma delas");
  } else {
    console.log("❌ Uma ou ambas as mensagens falharam");
  }
}

testLockViaWebhook().catch(console.error);
