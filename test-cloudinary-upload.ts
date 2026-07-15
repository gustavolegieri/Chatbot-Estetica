/**
 * Script de teste para upload de imagem no Cloudinary
 * Execute: npx tsx test-cloudinary-upload.ts
 */

import { config } from "dotenv";
import { uploadImageToCloudinary } from "./src/lib/image-upload";
import { convertSvgToPng } from "./src/lib/calendar-converter";
import { generateCalendarImage } from "./src/lib/calendar-core";

// Carregar variáveis de ambiente do .env
config();

async function testCloudinaryUpload() {
  console.log("🧪 Testando upload de imagem no Cloudinary\n");

  // Verificar configuração
  console.log("📋 Configuração Cloudinary:");
  console.log("- Cloud Name:", process.env.CLOUDINARY_CLOUD_NAME || "❌ Não configurado");
  console.log("- API Key:", process.env.CLOUDINARY_API_KEY ? `${process.env.CLOUDINARY_API_KEY.substring(0, 8)}...` : "❌ Não configurado");
  console.log("- API Secret:", process.env.CLOUDINARY_API_SECRET ? `${process.env.CLOUDINARY_API_SECRET.substring(0, 8)}...` : "❌ Não configurado");
  console.log();

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("❌ ERRO: Cloudinary não está configurado");
    console.log("💡 Configure as variáveis de ambiente no .env:");
    console.log("   CLOUDINARY_CLOUD_NAME=seu-cloud-name");
    console.log("   CLOUDINARY_API_KEY=sua-api-key");
    console.log("   CLOUDINARY_API_SECRET=sua-api-secret");
    return;
  }

  try {
    // Passo 1: Gerar calendário SVG
    console.log("📅 Passo 1: Gerando calendário SVG...");
    const svgDataUrl = await generateCalendarImage(new Date());
    const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
    const svgBuffer = Buffer.from(svgString, 'base64');
    const svgContent = svgBuffer.toString('utf-8');
    console.log("✅ SVG gerado");

    // Passo 2: Converter para PNG
    console.log("🖼️  Passo 2: Convertendo SVG para PNG...");
    const conversionResult = await convertSvgToPng(svgContent, {
      width: 1080,
      quality: 90
    });

    if (!conversionResult.success || !conversionResult.pngBuffer) {
      console.error("❌ Falha na conversão:", conversionResult.error);
      return;
    }

    console.log("✅ PNG convertido, tamanho:", conversionResult.pngBuffer.length, "bytes");

    // Passo 3: Upload para Cloudinary
    console.log("📤 Passo 3: Fazendo upload para Cloudinary...");
    const uploadResult = await uploadImageToCloudinary(conversionResult.pngBuffer, 'test-calendar');

    if (uploadResult.success && uploadResult.url) {
      console.log("✅ Upload realizado com sucesso!");
      console.log("📸 URL da imagem:", uploadResult.url);
      console.log();
      console.log("💡 Você pode usar esta URL para enviar via WhatsApp:");
      console.log(`   imageUrl: "${uploadResult.url}"`);
    } else {
      console.warn("⚠️ Upload para Cloudinary falhou:", uploadResult.error);
      console.log("🔄 Testando fallback local...");
      
      // Testar fallback local
      const { uploadPngToStorage } = await import("./src/lib/calendar-converter");
      const localResult = await uploadPngToStorage(conversionResult.pngBuffer, 'test-calendar');
      
      if (localResult.success && localResult.url) {
        console.log("✅ Fallback local funcionou!");
        console.log("📸 URL local:", localResult.url);
        console.log();
        console.log("💡 O sistema usará armazenamento local quando Cloudinary falhar.");
      } else {
        console.error("❌ Fallback local também falhou:", localResult.error);
      }
    }

  } catch (error) {
    console.error("❌ Erro no teste:", error);
  }
}

testCloudinaryUpload();