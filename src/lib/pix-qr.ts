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
  // TODO: Implementar payload real PIX
  
  return `00020126580014BR.GOV.BCB.PIX0136${data.key}520400005303986540${Math.floor(data.amount * 100).toString().padStart(11, '0')}5802BR5925${data.merchantName}6009${data.merchantCity}62070503***6304`;
}
