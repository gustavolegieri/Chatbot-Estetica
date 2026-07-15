/**
 * Script de teste para conversão de SVG para PNG e envio via WasenderAPI
 * Execute: npx tsx test-calendar-image.ts
 * 
 * Este script demonstra:
 * 1. Geração de um calendário SVG
 * 2. Conversão para PNG usando sharp
 * 3. Salvamento no diretório público
 * 4. Envio via WasenderAPI
 * 5. Tratamento de erros em cada etapa
 */

import { config } from "dotenv";
import { convertAndUploadCalendar } from "./src/lib/calendar-converter";
import { generateCalendarImage } from "./src/lib/calendar-core";
import { sendMedia } from "./src/lib/evolution-api";

// Carregar variáveis de ambiente do .env
config();

// Número de telefone para teste (substitua pelo seu número real)
const TEST_PHONE = "5511972851072"; // +55 11 97285-1072

async function testCalendarImageConversion() {
  console.log("🧪 Testando conversão de calendário SVG para PNG...\n");

  try {
    // Passo 1: Gerar SVG do calendário
    console.log("📅 Passo 1: Gerando SVG do calendário...");
    const today = new Date();
    const svgDataUrl = await generateCalendarImage(today);
    console.log("✅ SVG gerado com sucesso:", svgDataUrl.substring(0, 100) + "...\n");

    // Passo 2: Extrair SVG da data URL
    console.log("📝 Passo 2: Extraindo SVG da data URL...");
    const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    const svgBuffer = Buffer.from(svgString, 'base64');
    const svgContent = svgBuffer.toString('utf-8');
    console.log("✅ SVG extraído, tamanho:", svgContent.length, "bytes\n");

    // Passo 3: Converter SVG para PNG e salvar no diretório público
    console.log("🖼️  Passo 3: Convertendo SVG para PNG e salvando no diretório público...");
    const timestamp = Date.now();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const filename = `test-calendar-${year}-${month}-${timestamp}.png`;
    
    const conversionResult = await convertAndUploadCalendar(svgContent, filename, {
      width: 1080,  // Largura ideal para WhatsApp
      quality: 90
    });

    if (!conversionResult.success) {
      console.error("❌ Falha na conversão:", conversionResult.error);
      console.log("📋 Passos executados:", conversionResult.steps);
      return;
    }

    console.log("✅ Conversão bem-sucedida!");
    console.log("📁 URL pública:", conversionResult.url);
    console.log("📋 Passos executados:", conversionResult.steps.join('\n'));
    console.log();

    // Passo 4: Testar envio via WasenderAPI (opcional)
    const apiKey = process.env.WASENDER_API_KEY;
    if (!apiKey) {
      console.log("⚠️  WASENDER_API_KEY não configurada, pulando teste de envio");
      console.log("💡 Para testar o envio, configure WASENDER_API_KEY no .env");
      return;
    }

    console.log("📱 Passo 4: Testando envio via WasenderAPI...");
    console.log("📞 Para:", TEST_PHONE);
    
    const sendResult = await sendMedia({
      number: TEST_PHONE,
      mediaUrl: conversionResult.url!,
      caption: "📅 Calendário de disponibilidade (teste de conversão SVG→PNG)"
    }) as any;

    if (sendResult.error) {
      console.error("❌ Erro no envio:", sendResult.error);
    } else {
      console.log("✅ Envio bem-sucedido!");
      console.log("📊 Resultado:", JSON.stringify(sendResult, null, 2));
    }

  } catch (error) {
    console.error("❌ Erro no teste:", error);
    console.error("💡 Verifique:");
    console.error("   1. Se a dependência 'sharp' está instalada");
    console.error("   2. Se o diretório 'public/tmp/' tem permissões de escrita");
    console.error("   3. Se WASENDER_API_KEY está configurada corretamente");
  }
}

// Executar teste
testCalendarImageConversion()
  .then(() => {
    console.log("\n✅ Teste concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Teste falhou:", error);
    process.exit(1);
  });
