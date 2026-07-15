import { renderLogo } from "./svg-utils";
import sharp from 'sharp';
import { uploadImageToCloudinary } from './image-upload';

export interface SummaryCardData {
  customerName: string;
  serviceName: string;
  vehicle: string;
  date: string;
  time: string;
  paymentMethod: string;
  totalPrice: number;
  pickupAddress?: string;
}

// Ícones SVG como paths (sem <svg> aninhado, conforme regra 1)
const ICONS = {
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  service: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  calendar: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  card: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  money: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  location: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
};

/**
 * Gera imagem visual do resumo do agendamento usando SVG e converte para PNG com upload no Cloudinary.
 * Segue regras técnicas estritas para evitar sobreposição e bugs de renderização.
 */
export async function generateSummaryCard(data: SummaryCardData): Promise<string> {
  try {
    console.log("[generateSummaryCard] Generating card with data:", JSON.stringify(data, null, 2));
    
    // Dimensões fixas (regra 5: calcular altura exata)
    const width = 600;
    const outerPadding = 24;
    const cardPadding = 24;
    const fieldLineHeight = 54; // Regra 2: altura fixa mínima por linha
    const iconSize = 20;
    const iconCircleSize = 32;
    const dividerSpacing = 12; // Espaço para linha divisória no meio (regra 2)
    const titleSize = 28;
    const logoHeight = 60;
    const logoMargin = 24;
    const titleMargin = 16;
    const totalSectionHeight = 80; // Regra 3: espaço reservado para total
    const footerHeight = 40;
    
    // Escape XML special characters
    const escapeXml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Word wrap para endereços longos
    const wrapText = (text: string, maxChars: number = 38): string[] => {
      if (!text) return [];
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      words.forEach(word => {
        if ((currentLine + ' ' + word).trim().length <= maxChars) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      
      return lines.length > 0 ? lines : [text];
    };

    // Campos principais
    const mainFields = [
      { icon: ICONS.user, label: "Cliente", value: data.customerName },
      { icon: ICONS.service, label: "Serviço", value: data.serviceName },
      { icon: ICONS.car, label: "Veículo", value: data.vehicle },
      { icon: ICONS.calendar, label: "Data", value: data.date },
      { icon: ICONS.clock, label: "Horário", value: data.time },
      { icon: ICONS.card, label: "Pagamento", value: data.paymentMethod },
    ];

    // Processar endereço com word wrap
    const addressLines = data.pickupAddress ? wrapText(data.pickupAddress) : [];
    if (addressLines.length > 0) {
      mainFields.push({ icon: ICONS.location, label: "Endereço", value: addressLines[0] });
    }

    // Calcular altura exata (regra 5)
    const logoSectionHeight = logoHeight + logoMargin;
    const titleSectionHeight = titleSize + titleMargin + 20; // +20 para linha divisória
    const mainFieldsHeight = mainFields.length * fieldLineHeight;
    const addressExtraHeight = addressLines.length > 1 ? (addressLines.length - 1) * 24 : 0;
    const contentHeight = cardPadding * 2 + mainFieldsHeight + addressExtraHeight + totalSectionHeight;
    const totalHeight = outerPadding + logoSectionHeight + titleSectionHeight + contentHeight + footerHeight + outerPadding;

    // Gerar SVG dos campos (regra 1: usar <g> em vez de <svg> aninhado)
    let fieldsSvg = '';
    let currentY = cardPadding;
    const iconScale = iconSize / 24; // Escalar ícone para tamanho desejado
    
    mainFields.forEach((field, index) => {
      const y = currentY + (index * fieldLineHeight);
      
      // Ícone em círculo (regra 1: <g> com transform)
      const dividerSvg = index < mainFields.length - 1 ? `
        <line x1="${cardPadding}" y1="${y + fieldLineHeight - dividerSpacing}" x2="${width - outerPadding * 2 - cardPadding}" y2="${y + fieldLineHeight - dividerSpacing}" stroke="#FFD700" stroke-width="1" opacity="0.08"/>
      ` : '';
      
      fieldsSvg += `
        <g transform="translate(${cardPadding}, ${y})">
          <circle cx="${iconCircleSize / 2}" cy="${iconCircleSize / 2}" r="${iconCircleSize / 2}" fill="#FFD700" opacity="0.12"/>
          <g transform="translate(${(iconCircleSize - iconSize) / 2}, ${(iconCircleSize - iconSize) / 2}) scale(${iconScale})">
            <path d="${field.icon}" fill="#e0c060"/>
          </g>
          <text x="${iconCircleSize + 12}" y="${iconSize - 2}" fill="#e0c060" font-family="Arial, sans-serif" font-size="16" font-weight="500">${escapeXml(field.label)}:</text>
          <text x="${iconCircleSize + 12}" y="${iconSize + 14}" fill="#ffffff" font-family="Arial, sans-serif" font-size="18">${escapeXml(field.value)}</text>
        </g>
        ${dividerSvg}
      `;
    });

    // Linhas extras do endereço
    if (addressLines.length > 1) {
      const addressExtraStartY = currentY + (mainFields.length * fieldLineHeight);
      addressLines.slice(1).forEach((line, index) => {
        const lineY = addressExtraStartY + (index * 24);
        fieldsSvg += `
          <text x="${cardPadding + iconCircleSize + 12}" y="${lineY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="18">${escapeXml(line)}</text>
        `;
      });
    }

    // Total destacado (regra 3: espaço vazio mínimo acima)
    const totalY = cardPadding + mainFieldsHeight + addressExtraHeight + 24; // 24px de espaço acima
    const totalText = `R$ ${data.totalPrice.toFixed(2).replace('.', ',')}`;
    
    // Logo real usando função compartilhada
    const logoSvg = await renderLogo((width - 80) / 2, outerPadding, 80, logoHeight);
    
    const svg = `
      <svg width="${width}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalHeight}">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="divider" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#FFD700;stop-opacity:0" />
            <stop offset="50%" style="stop-color:#FFD700;stop-opacity:0.5" />
            <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0" />
          </linearGradient>
        </defs>
        
        <!-- Fundo principal -->
        <rect width="100%" height="100%" fill="url(#bg)" />
        
        <!-- Logo real -->
        ${logoSvg}
        
        <!-- Título -->
        <text x="${width / 2}" y="${outerPadding + logoSectionHeight + titleSize - 6}" fill="#FFD700" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="bold" text-anchor="middle">RESUMO DO AGENDAMENTO</text>
        
        <!-- Linha divisória com gradiente -->
        <rect x="${outerPadding}" y="${outerPadding + logoSectionHeight + titleSize + titleMargin - 10}" width="${width - outerPadding * 2}" height="1" fill="url(#divider)" />
        
        <!-- Sombra do cartão -->
        <rect x="${outerPadding + 4}" y="${outerPadding + logoSectionHeight + titleSectionHeight + 4}" width="${width - outerPadding * 2}" height="${contentHeight}" fill="#000000" opacity="0.2" rx="16"/>
        
        <!-- Cartão/Container -->
        <g transform="translate(${outerPadding}, ${outerPadding + logoSectionHeight + titleSectionHeight})">
          <rect width="${width - outerPadding * 2}" height="${contentHeight}" fill="#20263f" rx="16" opacity="0.95"/>
          <rect width="${width - outerPadding * 2}" height="${contentHeight}" fill="none" stroke="#FFD700" stroke-width="1" opacity="0.15" rx="16"/>
          
          <!-- Elementos decorativos nos cantos superiores -->
          <path d="M 16 0 L 16 8 M 0 16 L 8 16" stroke="#FFD700" stroke-width="2" opacity="0.3" fill="none"/>
          <path d="M ${width - outerPadding * 2 - 16} 0 L ${width - outerPadding * 2 - 16} 8 M ${width - outerPadding * 2} 16 L ${width - outerPadding * 2 - 8} 16" stroke="#FFD700" stroke-width="2" opacity="0.3" fill="none"/>
          
          <!-- Campos -->
          ${fieldsSvg}
          
          <!-- Fundo diferenciado para o total -->
          <rect x="${cardPadding}" y="${totalY - 10}" width="${width - outerPadding * 2 - cardPadding * 2}" height="60" fill="#FFD700" opacity="0.08" rx="8"/>
          
          <!-- Total destacado (regra 4: padding lateral para texto alinhado à direita) -->
          <g transform="translate(${cardPadding}, ${totalY})">
            <circle cx="${iconCircleSize / 2}" cy="${iconCircleSize / 2}" r="${iconCircleSize / 2}" fill="#FFD700" opacity="0.12"/>
            <g transform="translate(${(iconCircleSize - iconSize) / 2}, ${(iconCircleSize - iconSize) / 2}) scale(${iconScale})">
              <path d="${ICONS.money}" fill="#e0c060"/>
            </g>
            <text x="${iconCircleSize + 12}" y="${iconSize + 8}" fill="#e0c060" font-family="Arial, sans-serif" font-size="20" font-weight="bold">TOTAL:</text>
            <text x="${width - outerPadding * 2 - cardPadding - 24}" y="${iconSize + 8}" fill="#FFD700" font-family="Arial, sans-serif" font-size="32" font-weight="bold" text-anchor="end">${escapeXml(totalText)}</text>
          </g>
        </g>
        
        <!-- Rodapé -->
        <text x="${width / 2}" y="${totalHeight - outerPadding - 10}" fill="#888888" font-family="Arial, sans-serif" font-size="16" text-anchor="middle">Cancelamento até 2h antes sem custo</text>
      </svg>
    `;

    // Converter SVG para PNG usando sharp
    console.log("[generateSummaryCard] Convertendo SVG para PNG...");
    const svgBuffer = Buffer.from(svg);
    
    const pngBuffer = await sharp(svgBuffer, {
      density: 300
    })
    .png({
      quality: 90,
      compressionLevel: 6
    })
    .toBuffer();
    
    console.log("[generateSummaryCard] PNG gerado, tamanho:", pngBuffer.length, "bytes");
    
    // Fazer upload para Cloudinary
    console.log("[generateSummaryCard] Fazendo upload para Cloudinary...");
    const timestamp = Date.now();
    const filename = `summary-${data.customerName.replace(/\s+/g, '-')}-${timestamp}`;
    
    const uploadResult = await uploadImageToCloudinary(pngBuffer, filename, 'summaries');
    
    if (uploadResult.success && uploadResult.url) {
      console.log("[generateSummaryCard] Upload realizado com sucesso:", uploadResult.url);
      return uploadResult.url;
    } else {
      console.error("[generateSummaryCard] Falha no upload:", uploadResult.error);
      // Fallback para placeholder
      const text = `${data.customerName} - ${data.serviceName} - R$ ${data.totalPrice.toFixed(2)}`;
      return `https://placehold.co/600x450/1a1a2e/FFD700?text=${encodeURIComponent(text)}`;
    }
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
