import { sendText } from "@/lib/evolution-api";

/**
 * Teste para validar envio de mensagens muito curtas
 * Simula o problema onde "ll" era enviado mas não chegava
 */
async function testShortMessages() {
  console.log("[TEST] Testando envio de mensagens curtas...\n");

  const testCases = [
    { text: "ll", shouldFail: true, reason: "Apenas 2 caracteres iguais" },
    { text: "!@#$", shouldFail: true, reason: "Apenas símbolos" },
    { text: "   ", shouldFail: true, reason: "Apenas espaços" },
    { text: "Oi", shouldFail: false, reason: "Mensagem válida curta" },
    { text: "Hi", shouldFail: false, reason: "Mensagem válida" },
    { text: "Teste de envio", shouldFail: false, reason: "Mensagem normal" },
  ];

  const phone = "5511972851072"; // Telefone de teste

  for (const testCase of testCases) {
    console.log(`\n📝 Teste: "${testCase.text}" (${testCase.reason})`);
    console.log(`   Esperado falhar: ${testCase.shouldFail}`);

    try {
      const result = await sendText({
        number: phone,
        text: testCase.text,
        sender: "ADMIN",
        skipBotLog: true,
        flowStage: "TEST",
      });

      const hasError = result && typeof result === "object" && "error" in result;
      const status = hasError ? "❌ ERRO" : "✅ OK";
      
      console.log(`   Resultado: ${status}`);
      console.log(`   Response:`, result);

      // Validar resultado
      if (testCase.shouldFail && !hasError) {
        console.warn("   ⚠️ FALHA: Deveria ter falhado mas não falhou");
      } else if (!testCase.shouldFail && hasError) {
        console.warn("   ⚠️ FALHA: Deveria ter sucesso mas falhou");
      } else {
        console.log("   ✅ SUCESSO: Comportamento correto");
      }
    } catch (err) {
      console.error(`   ❌ EXCEÇÃO:`, err);
    }
  }

  console.log("\n[TEST] Testes completados!");
}

testShortMessages().catch(console.error);
