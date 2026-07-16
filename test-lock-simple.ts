import { config } from "dotenv";
config();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const TEST_PHONE = "5511972851072";

async function testLockSimple() {
  console.log("🧪 Testando lock distribuído (teste simples)...");
  console.log("📋 Disparando 2 mensagens com 200ms de diferença");

  // Primeira mensagem
  console.log("📤 Enviando mensagem 1...");
  const response1 = await fetch(`${BASE_URL}/api/admin/test-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: "1",
      pushName: "Test User 1"
    })
  });

  console.log("⏳ Aguardando 200ms...");
  await new Promise(resolve => setTimeout(resolve, 200));

  // Segunda mensagem
  console.log("📤 Enviando mensagem 2...");
  const response2 = await fetch(`${BASE_URL}/api/admin/test-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: "1",
      pushName: "Test User 2"
    })
  });

  const data1 = await response1.json();
  const data2 = await response2.json();

  console.log("📝 Resultado da mensagem 1:", data1.success ? "✅ Sucesso" : "❌ Falha");
  console.log("📝 Resultado da mensagem 2:", data2.success ? "✅ Sucesso" : "❌ Falha");

  if (data1.success && data2.success) {
    console.log("✅ Teste concluído - verifique os logs do servidor");
  } else {
    console.log("❌ Teste falhou");
  }
}

testLockSimple().catch(console.error);
