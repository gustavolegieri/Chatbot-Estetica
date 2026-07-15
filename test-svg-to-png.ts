/**
 * Script simples para testar conversão SVG para PNG
 * Execute: npx tsx test-svg-to-png.ts
 * 
 * Este script testa apenas a conversão SVG→PNG sem envio via WhatsApp
 * Útil para debugar problemas de conversão isoladamente
 */

import { config } from "dotenv";
import { convertSvgToPng, savePngLocally } from "./src/lib/calendar-converter";
import { generateCalendarImage } from "./src/lib/calendar-core";

// Carregar variáveis de ambiente do .env
config();

async function testSvgToPngConversion() {
  console.log("🧪 Testando conversão SVG para PNG (isolada)...\n");

  try {
    // Passo 1: Gerar SVG do calendário
    console.log("📅 Passo 1: Gerando SVG do calendário...");
    const today = new Date();
    const svgDataUrl = await generateCalendarImage(today);
    console.log("✅ SVG gerado com sucesso");
    console.log("📏 Tamanho do SVG:", svgDataUrl.length, "bytes\n");

    // Passo 2: Extrair SVG da data URL
    console.log("📝 Passo 2: Extraindo SVG da data URL...");
    const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    const svgBuffer = Buffer.from(svgString, 'base64');
    const svgContent = svgBuffer.toString('utf-8');
    console.log("✅ SVG extraído");
    console.log("📏 Tamanho do SVG extraído:", svgContent.length, "bytes\n");

    // Passo 3: Converter SVG para PNG
    console.log("🖼️  Passo 3: Convertendo SVG para PNG...");
    const conversionResult = await convertSvgToPng(svgContent, {
      width: 1080,  // Largura ideal para WhatsApp
      quality: 90
    });

    if (!conversionResult.success) {
      console.error("❌ Falha na conversão:", conversionResult.error);
      return;
    }

    console.log("✅ Conversão bem-sucedida!");
    console.log("📏 Tamanho do PNG:", conversionResult.pngBuffer?.length, "bytes\n");

    // Passo 4: Salvar PNG localmente para inspeção
    console.log("💾 Passo 4: Salvando PNG localmente...");
    await savePngLocally(conversionResult.pngBuffer!, 'test-calendar-output.png');
    console.log("✅ PNG salvo como 'test-calendar-output.png' na raiz do projeto\n");

    console.log("🎉 Teste concluído com sucesso!");
    console.log("💡 Verifique o arquivo 'test-calendar-output.png' para validar a qualidade da imagem");

  } catch (error) {
    console.error("❌ Erro no teste:", error);
    console.error("💡 Verifique:");
    console.error("   1. Se a dependência 'sharp' está instalada corretamente");
    console.error("   2. Se o SVG gerado é válido");
    console.error("   3. Se há permissões para escrever no diretório atual");
    throw error;
  }
}

// Executar teste
testSvgToPngConversion()
  .then(() => {
    console.log("\n✅ Teste concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Teste falhou:", error);
    process.exit(1);
  });
