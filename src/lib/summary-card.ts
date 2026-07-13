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
 * Gera imagem visual do resumo do agendamento usando SVG (compatível com Vercel).
 */
export async function generateSummaryCard(data: SummaryCardData): Promise<string> {
  try {
    console.log("[generateSummaryCard] Generating card with data:", JSON.stringify(data, null, 2));
    
    const width = 600;
    const height = 550;
    
    // Escape XML special characters
    const escapeXml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const items = [
      { label: "👤 Cliente:", value: data.customerName },
      { label: "🧽 Serviço:", value: data.serviceName },
      { label: "🚘 Veículo:", value: data.vehicle },
      { label: "📅 Data:", value: data.date },
      { label: "⏰ Horário:", value: data.time },
      { label: "💳 Pagamento:", value: data.paymentMethod },
      { label: "💰 Total:", value: `R$ ${data.totalPrice.toFixed(2).replace('.', ',')}` },
    ];

    let contentY = 130;
    const lineHeight = 50;
    
    let itemsSvg = items.map((item, index) => {
      const y = contentY + (index * lineHeight);
      return `
        <text x="40" y="${y}" fill="#FFD700" font-family="Arial, sans-serif" font-size="24" font-weight="bold">${escapeXml(item.label)}</text>
        <text x="180" y="${y}" fill="#ffffff" font-family="Arial, sans-serif" font-size="24">${escapeXml(item.value)}</text>
      `;
    }).join('');

    let pickupSvg = '';
    if (data.pickupAddress) {
      const pickupY = contentY + (items.length * lineHeight);
      pickupSvg = `
        <text x="40" y="${pickupY}" fill="#FFD700" font-family="Arial, sans-serif" font-size="24" font-weight="bold">📍 Endereço:</text>
        <text x="180" y="${pickupY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="24">${escapeXml(data.pickupAddress)}</text>
      `;
    }

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <rect width="100%" height="100%" fill="url(#bg)" />
        
        <text x="300" y="55" fill="#FFD700" font-family="Arial, sans-serif" font-size="36" font-weight="bold" text-anchor="middle">📋 RESUMO DO AGENDAMENTO</text>
        
        <line x1="30" y1="80" x2="570" y2="80" stroke="#FFD700" stroke-width="2" />
        
        ${itemsSvg}
        ${pickupSvg}
        
        <text x="300" y="${height - 35}" fill="#888888" font-family="Arial, sans-serif" font-size="20" text-anchor="middle">Cancelamento até 2h antes sem custo</text>
      </svg>
    `;

    // Convert SVG to base64 data URL
    const base64 = Buffer.from(svg).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    
    console.log("[generateSummaryCard] SVG generated as data URL, size:", base64.length);
    
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
