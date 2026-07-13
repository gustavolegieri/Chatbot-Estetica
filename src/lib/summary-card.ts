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
    console.log("[generateSummaryCard] Generating card with data:", JSON.stringify(data, null, 2));
    
    const width = 600;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#1a1a2e");
    gradient.addColorStop(1, "#16213e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("📋 RESUMO DO AGENDAMENTO", width / 2, 45);

    // Line separator
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 65);
    ctx.lineTo(width - 30, 65);
    ctx.stroke();

    // Content
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.textAlign = "left";
    
    const startY = 110;
    const lineHeight = 40;
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
      ctx.fillText(item.label, 40, currentY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(item.value, 180, currentY);
      currentY += lineHeight;
    });

    if (data.pickupAddress) {
      ctx.fillStyle = "#FFD700";
      ctx.fillText("📍 Endereço:", 40, currentY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(data.pickupAddress, 180, currentY);
      currentY += lineHeight;
    }

    // Footer
    ctx.fillStyle = "#888888";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Cancelamento até 2h antes sem custo", width / 2, height - 25);

    // Convert to buffer and then to base64 data URL (works in Vercel)
    const buffer = canvas.toBuffer("image/png");
    const base64 = buffer.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    
    console.log("[generateSummaryCard] Image generated as data URL, size:", buffer.length);
    
    return dataUrl;
  } catch (error) {
    console.error("[generateSummaryCard] Error:", error);
    // Fallback to placeholder with actual data
    const text = `${data.customerName} - ${data.serviceName} - R$ ${data.totalPrice.toFixed(2)}`;
    return `https://placehold.co/600x450/1a1a2e/FFD700?text=${encodeURIComponent(text)}`;
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
