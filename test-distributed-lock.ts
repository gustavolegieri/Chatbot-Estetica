import { config } from "dotenv";
config();

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
const TEST_PHONE = "5511972851072"; // Use seu número real para teste

async function testDistributedLock() {
  console.log("🧪 Testando lock distribuído...");
  console.log("📋 Disparando 2 mensagens simultâneas com <300ms de diferença");

  const message1 = "1";
  const message2 = "1";

  const startTime = Date.now();

  // Dispara primeira mensagem
  const promise1 = fetch(`${BASE_URL}/api/admin/test-lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: message1,
      pushName: "Test User 1"
    })
  });

  // Espera 200ms e dispara segunda mensagem
  await new Promise(resolve => setTimeout(resolve, 200));
  const promise2 = fetch(`${BASE_URL}/api/admin/test-lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: message2,
      pushName: "Test User 2"
    })
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

  if (data1.success && data2.success) {
    console.log("✅ Ambas as mensagens foram processadas com sucesso");
    console.log("⚠️  Verifique os logs para ver se o lock funcionou (deve mostrar '[Lock] Mensagem ignorada' em uma delas)");
  } else {
    console.log("❌ Uma ou ambas as mensagens falharam");
  }
}

testDistributedLock().catch(console.error);
