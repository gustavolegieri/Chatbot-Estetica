import { config } from "dotenv";
config();

const BASE_URL = "http://localhost:3002"; // Forçar localhost para teste local
const TEST_PHONE = "5511972851072";

async function testLockReal() {
  console.log("🧪 Testando lock distribuído via /api/admin/test-webhook...");
  console.log("📋 Disparando 2 mensagens com 600ms de diferença (maior que debounce de 500ms)");

  const message = "1"; // Mensagem que deve avançar o estágio

  const startTime = Date.now();

  // Dispara primeira mensagem
  console.log("📤 Enviando mensagem 1...");
  const promise1 = fetch(`${BASE_URL}/api/admin/test-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: message,
      pushName: "Test User 1"
    })
  });

  // Espera 600ms para garantir que seja maior que o debounce (500ms)
  await new Promise(resolve => setTimeout(resolve, 600));
  
  console.log("📤 Enviando mensagem 2...");
  const promise2 = fetch(`${BASE_URL}/api/admin/test-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: TEST_PHONE,
      text: message,
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

  console.log("📝 Resultado da mensagem 1:", data1.success ? "✅ Sucesso" : "❌ Falha");
  console.log("📝 Resultado da mensagem 2:", data2.success ? "✅ Sucesso" : "❌ Falha");

  if (data1.success && data2.success) {
    console.log("✅ Ambas as requisições HTTP foram bem-sucedidas");
    console.log("⚠️  Verifique os logs do servidor para ver se o lock funcionou");
    console.log("   Deve mostrar:");
    console.log("   - '[Lock] Lock adquirido com sucesso para 5511972851072' (uma vez)");
    console.log("   - '[Lock] Mensagem ignorada — outra instância já está processando' (uma vez)");
    console.log("   - '[Lock] Lock liberado para 5511972851072' (uma vez)");
  } else {
    console.log("❌ Uma ou ambas as requisições falharam");
  }
}

testLockReal().catch(console.error);
