/**
 * Gera QR Code PIX para pagamento.
 * Para produção, integrar com gateway de pagamento real (Mercado Pago, Stripe, etc).
 * Por enquanto, usa placeholder.
 */
import QRCode from 'qrcode';

export interface PixQrCodeData {
  amount: number;
  description: string;
  merchantName: string;
  merchantCity: string;
  key: string;
}

export async function generatePixQrCode(data: PixQrCodeData): Promise<string> {
  try {
    const payload = generatePixPayload(data);
    
    // Generate QR code as base64 data URL (works in Vercel)
    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    console.log('[generatePixQrCode] QR Code generated as data URL');
    
    // Return the data URL directly (works in Vercel serverless)
    return qrCodeDataUrl;
  } catch (error) {
    console.error('[generatePixQrCode] Error:', error);
    // Fallback to placeholder
    return `https://placehold.co/300x300/00ff00/ffffff?text=PIX+QR+Code&text=${data.amount.toFixed(2)}`;
  }
}

export function generatePixPayload(data: PixQrCodeData): string {
  // Gera payload PIX Copia e Cola (formato padrão do Banco Central)
  // Implementação simplificada para desenvolvimento

  const key = data.key;
  const amount = Math.floor(data.amount * 100).toString().padStart(11, '0');
  const merchantName = data.merchantName.substring(0, 25).padEnd(25, ' ');
  const merchantCity = data.merchantCity.substring(0, 15).padEnd(15, ' ');

  // Payload simplificado para QR Code PIX
  // Em produção, usar biblioteca oficial do Banco Central
  const payload = `00020126580014BR.GOV.BCB.PIX0136${key}520400005303986540${amount}5802BR59${merchantName}6009${merchantCity}62070503***6304`;

  // Calcular CRC16-CCITT para o payload (simplificado)
  const crc = calculateCRC16(payload.substring(0, payload.length - 4));
  const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

  return payload.substring(0, payload.length - 4) + crcHex;
}

// Função simplificada para cálculo de CRC16-CCITT
function calculateCRC16(data: string): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return crc & 0xFFFF;
}
