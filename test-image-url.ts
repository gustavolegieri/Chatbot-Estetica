/**
 * Teste se a URL da imagem está acessível
 * Execute: npx tsx test-image-url.ts
 */

import { config } from "dotenv";

config();

const IMAGE_URL = "https://chatbot-estetica-ten.vercel.app/tmp/test-calendar-2026-07-1784118658493.png";

async function testImageUrl() {
  console.log("🔍 Testando acessibilidade da imagem\n");
  console.log("URL:", IMAGE_URL);
  console.log();

  try {
    const response = await fetch(IMAGE_URL);
    console.log("Status:", response.status, response.statusText);
    console.log("Content-Type:", response.headers.get("content-type"));
    console.log("Content-Length:", response.headers.get("content-length"));
    
    if (response.ok) {
      console.log("✅ Imagem acessível!");
      const buffer = await response.arrayBuffer();
      console.log("Tamanho:", buffer.length, "bytes");
    } else {
      console.log("❌ Imagem não acessível");
      const text = await response.text();
      console.log("Erro:", text);
    }
  } catch (error) {
    console.error("❌ Erro ao acessar imagem:", error);
  }
}

testImageUrl();