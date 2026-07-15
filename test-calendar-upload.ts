/**
 * Teste completo do fluxo de calendário com upload
 */

import { config } from "dotenv";
import { convertAndUploadCalendar } from "./src/lib/calendar-converter";
import { generateCalendarImage } from "./src/lib/calendar-core";

// Carregar variáveis de ambiente
config();

async function testCalendarUpload() {
  console.log("🧪 Teste completo do fluxo de calendário\n");

  try {
    // Passo 1: Gerar calendário SVG
    console.log("📅 Passo 1: Gerando calendário SVG...");
    const svgDataUrl = await generateCalendarImage(new Date());
    const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    const svgBuffer = Buffer.from(svgString, 'base64');
    const svgContent = svgBuffer.toString('utf-8');
    console.log("✅ SVG gerado");

    // Passo 2: Converter e fazer upload
    console.log("🔄 Passo 2: Converter e fazer upload...");
    const result = await convertAndUploadCalendar(svgContent, 'test-calendar-complete');

    console.log("\n📋 Resultado:");
    console.log("- Sucesso:", result.success);
    console.log("- URL:", result.url);
    console.log("- Erro:", result.error);
    console.log("\n📝 Passos executados:");
    result.steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });

    if (result.success && result.url) {
      console.log("\n🎉 Sistema funcionando perfeitamente!");
      console.log("📸 URL da imagem:", result.url);
      console.log("💡 Esta URL pode ser usada para enviar via WhatsApp");
    } else {
      console.log("\n❌ Sistema encontrou problemas");
    }

  } catch (error) {
    console.error("❌ Erro no teste:", error);
  }
}

testCalendarUpload();