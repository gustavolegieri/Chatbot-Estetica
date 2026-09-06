/**
 * Gera QR Code PIX para pagamento.
 * Para produção, integrar com gateway de pagamento real (Mercado Pago, Stripe, etc).
 * Por enquanto, usa placeholder.
 */
import QRCode from 'qrcode';
import { uploadImageToCloudinary } from './image-upload';

export interface PixQrCodeData {
  amount: number;
  description: string;
  merchantName: string;
  merchantCity: string;
  key: string;
}

export async function generatePixQrCode(
  data: PixQrCodeData,
  uploadFn: typeof uploadImageToCloudinary = uploadImageToCloudinary
): Promise<string> {
  try {
    const payload = generatePixPayload(data);

    const qrCodeBuffer = await QRCode.toBuffer(payload, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const timestamp = Date.now();
    const uploadResult = await uploadFn(
      Buffer.from(qrCodeBuffer),
      `pix-qr-${timestamp}`,
      'pix-qr'
    );

    if (uploadResult.success && uploadResult.url) {
      console.log('[generatePixQrCode] QR Code uploaded to public URL:', uploadResult.url);
      return uploadResult.url;
    }

    console.warn('[generatePixQrCode] Upload failed, falling back to placeholder:', uploadResult.error);
    return `https://placehold.co/300x300/00ff00/ffffff?text=PIX+QR+Code&text=${data.amount.toFixed(2)}`;
  } catch (error) {
    console.error('[generatePixQrCode] Error:', error);
    return `https://placehold.co/300x300/00ff00/ffffff?text=PIX+QR+Code&text=${data.amount.toFixed(2)}`;
  }
}

/**
 * Campo do BR Code: identificador, tamanho com dois dígitos e valor.
 *
 * O tamanho é o que fazia o código anterior falhar: ele vinha fixo no
 * template (`0136` para a chave, `540` para o valor), então qualquer chave que
 * não tivesse 36 caracteres — e-mail, telefone, CPF, chave aleatória com outro
 * formato — ou qualquer valor com número de dígitos diferente produzia um
 * código que o app do banco recusa.
 */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** Tira acento e símbolo: o BR Code aceita só ASCII imprimível. */
function apenasAscii(texto: string, limite: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^ -~]/g, "")
    .trim()
    .slice(0, limite);
}

/**
 * PIX Copia e Cola no formato EMV do Banco Central.
 *
 * A ordem dos campos é a da especificação e o CRC16 fecha o código — os dois
 * são verificados pelo app do banco antes de mostrar o pagamento.
 */
export function generatePixPayload(data: PixQrCodeData): string {
  const chave = data.key.trim();
  const conta = campo("00", "BR.GOV.BCB.PIX") + campo("01", chave);
  const valor = data.amount > 0 ? data.amount.toFixed(2) : null;

  const partes = [
    campo("00", "01"),
    campo("26", conta),
    campo("52", "0000"),
    campo("53", "986"),
    valor ? campo("54", valor) : "",
    campo("58", "BR"),
    campo("59", apenasAscii(data.merchantName, 25) || "GARAGEM DO KA"),
    campo("60", apenasAscii(data.merchantCity, 15) || "JUNDIAI"),
    campo("62", campo("05", "***")),
  ];

  const semCrc = `${partes.join("")}6304`;
  const crc = calculateCRC16(semCrc).toString(16).toUpperCase().padStart(4, "0");
  return `${semCrc}${crc}`;
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
