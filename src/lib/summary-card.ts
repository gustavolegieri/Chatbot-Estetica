import { createCanvas, loadImage } from "@napi-rs/canvas";

interface SummaryCardData {
  customerName: string;
  serviceName: string;
  vehicle: string;
  date: string;
  time: string;
  paymentMethod: string;
  totalPrice: number;
  pickupAddress?: string;
}

/**
 * Gera imagem visual do resumo do agendamento usando canvas.
 */
export async function generateSummaryCard(data: SummaryCardData): Promise<string> {
  try {
    const width = 600;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📋 RESUMO DO AGENDAMENTO", width / 2, 40);

    // Line separator
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 60);
    ctx.lineTo(width - 20, 60);
    ctx.stroke();

    // Content
    ctx.fillStyle = "#ffffff";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "left";
    
    const startY = 100;
    const lineHeight = 35;
    let currentY = startY;

    const items = [
      { label: "👤 Cliente:", value: data.customerName },
      { label: "🧽 Serviço:", value: data.serviceName },
      { label: "🚘 Veículo:", value: data.vehicle },
      { label: "📅 Data:", value: data.date },
      { label: "⏰ Horário:", value: data.time },
      { label: "💳 Pagamento:", value: data.paymentMethod },
      { label: "💰 Total:", value: `R$ ${data.totalPrice.toFixed(2).replace('.', ',')}` },
    ];

    items.forEach((item) => {
      ctx.fillStyle = "#FFD700";
      ctx.fillText(item.label, 30, currentY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(item.value, 180, currentY);
      currentY += lineHeight;
    });

    if (data.pickupAddress) {
      ctx.fillStyle = "#FFD700";
      ctx.fillText("📍 Endereço:", 30, currentY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(data.pickupAddress, 180, currentY);
      currentY += lineHeight;
    }

    // Footer
    ctx.fillStyle = "#888888";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Cancelamento até 2h antes sem custo", width / 2, height - 20);

    // Convert to buffer
    const buffer = canvas.toBuffer("image/png");
    
    // Save to public folder (in production, upload to cloud storage)
    const fs = require("fs");
    const path = require("path");
    const publicDir = path.join(process.cwd(), "public");
    const filename = `summary-${Date.now()}.png`;
    const filepath = path.join(publicDir, filename);
    
    fs.writeFileSync(filepath, buffer);
    
    return `/${filename}`;
  } catch (error) {
    console.error("[generateSummaryCard] Error:", error);
    // Fallback to placeholder
    return `https://placehold.co/600x400/1a1a2e/FFD700?text=Resumo+do+Agendamento&font=playfair-display`;
  }
}

/**
 * Retorna o texto formatado do resumo (para caso a imagem falhar ou como fallback).
 */
export function generateSummaryText(data: SummaryCardData): string {
  const lines = [
    "━━━━━━━━━━━━━━━",
    "📋 **RESUMO DO AGENDAMENTO**",
    "",
    `👤 Cliente: ${data.customerName}`,
    `🧽 Serviço: ${data.serviceName}`,
    `🚘 Veículo: ${data.vehicle}`,
    `📅 Data: ${data.date}`,
    `⏰ Horário: ${data.time}`,
    data.pickupAddress ? `📍 Busca: ${data.pickupAddress}` : "",
    `💳 Pagamento: ${data.paymentMethod}`,
    `💰 Total: R$ ${data.totalPrice.toFixed(2).replace('.', ',')}`,
    "━━━━━━━━━━━━━━━",
    "",
    "✅ Confirma? (sim/não)",
  ];
  
  return lines.filter(Boolean).join("\n");
}
