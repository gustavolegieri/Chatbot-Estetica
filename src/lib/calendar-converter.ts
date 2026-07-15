/**
 * Conversão de SVG para PNG e envio via WasenderAPI
 * Resolve o problema do WhatsApp não renderizar SVG inline
 */

import sharp from 'sharp';
import { uploadImageToCloudinary, uploadToImgur, uploadToTelegraph, uploadToImgBB, uploadToFreeImage, uploadToPostImages } from './image-upload';

interface ConversionOptions {
  width?: number;
  height?: number;
  quality?: number;
}

interface ConversionResult {
  success: boolean;
  pngBuffer?: Buffer;
  error?: string;
}

/**
 * Converte SVG para PNG usando sharp
 * @param svgString - String do SVG
 * @param options - Opções de conversão (largura, altura, qualidade)
 * @returns Buffer do PNG ou erro
 */
export async function convertSvgToPng(
  svgString: string,
  options: ConversionOptions = {}
): Promise<ConversionResult> {
  const {
    width = 1080,  // Largura padrão boa para WhatsApp
    height,
    quality = 90    // Qualidade PNG (não usado muito, mas mantido para compatibilidade)
  } = options;

  try {
    console.log('[SVG Converter] Iniciando conversão SVG para PNG...');
    console.log('[SVG Converter] Tamanho do SVG:', svgString.length, 'bytes');
    console.log('[SVG Converter] Largura alvo:', width, 'px');

    // Converter SVG string para Buffer
    const svgBuffer = Buffer.from(svgString);

    // Usar sharp para converter SVG para PNG
    const sharpInstance = sharp(svgBuffer, {
      density: 300  // DPI para alta qualidade
    });

    // Configurar redimensionamento
    const resizeOptions: any = {
      width: width,
      fit: 'inside',
      withoutEnlargement: true
    };

    if (height) {
      resizeOptions.height = height;
    }

    // Converter para PNG
    const pngBuffer = await sharpInstance
      .resize(resizeOptions)
      .png({
        quality: quality,
        compressionLevel: 9,
        adaptiveFiltering: true
      })
      .toBuffer();

    console.log('[SVG Converter] Conversão concluída com sucesso');
    console.log('[SVG Converter] Tamanho do PNG:', pngBuffer.length, 'bytes');

    return {
      success: true,
      pngBuffer
    };

  } catch (error) {
    console.error('[SVG Converter] Erro na conversão:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido na conversão'
    };
  }
}

/**
 * Faz upload do buffer PNG para o diretório público local
 * e retorna a URL pública absoluta
 * @param pngBuffer - Buffer do PNG
 * @param filename - Nome do arquivo (opcional, será gerado automaticamente se não fornecido)
 * @returns URL pública da imagem ou erro
 */
export async function uploadPngToStorage(pngBuffer: Buffer, filename?: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Gerar nome único se não fornecido
    const timestamp = Date.now();
    const safeFilename = filename || `calendar-${timestamp}.png`;
    
    // Diretório público para imagens temporárias
    const publicDir = path.join(process.cwd(), 'public', 'tmp');
    const filePath = path.join(publicDir, safeFilename);
    
    // Criar diretório se não existir
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log('[Upload] Diretório criado:', publicDir);
    }
    
    // Salvar arquivo
    fs.writeFileSync(filePath, pngBuffer);
    console.log('[Upload] PNG salvo em:', filePath);
    
    // Retornar URL pública absoluta usando a nova API endpoint
    // Em produção, usa a URL do Vercel. Em desenvolvimento, usa localhost.
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseUrl = isDevelopment 
      ? 'http://localhost:3000' 
      : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    
    const publicUrl = `${baseUrl}/api/images/${safeFilename}`;
    console.log('[Upload] URL pública gerada:', publicUrl);
    console.log('[Upload] Ambiente:', isDevelopment ? 'desenvolvimento' : 'produção');
    
    return {
      success: true,
      url: publicUrl
    };

  } catch (error) {
    console.error('[Upload] Erro no upload:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}



/**
 * Processo completo: SVG → PNG → Upload (Cloudinary ou local) → URL pública
 * @param svgString - String do SVG
 * @param filename - Nome do arquivo (opcional)
 * @param conversionOptions - Opções de conversão
 * @returns Resultado completo do processo com URL pública
 */
export async function convertAndUploadCalendar(
  svgString: string,
  filename?: string,
  conversionOptions: ConversionOptions = {}
): Promise<{ success: boolean; url?: string; steps: string[]; error?: string; fallbackText?: string }> {
  const steps: string[] = [];

  try {
    // Passo 1: Converter SVG para PNG
    steps.push('Iniciando conversão SVG para PNG...');
    const conversionResult = await convertSvgToPng(svgString, conversionOptions);
    
    if (!conversionResult.success || !conversionResult.pngBuffer) {
      steps.push('❌ Falha na conversão SVG para PNG');
      return {
        success: false,
        steps,
        error: conversionResult.error || 'Falha na conversão'
      };
    }
    
    steps.push('✅ SVG convertido para PNG com sucesso');

    // Passo 2: Tentar upload para Cloudinary (SDK oficial)
    steps.push('Tentando upload para Cloudinary...');
    const cloudinaryResult = await uploadImageToCloudinary(conversionResult.pngBuffer, filename);
    
    if (cloudinaryResult.success && cloudinaryResult.url) {
      steps.push('✅ Upload para Cloudinary realizado com sucesso');
      return {
        success: true,
        url: cloudinaryResult.url,
        steps
      };
    }
    
    steps.push('⚠️ Cloudinary não disponível, tentando PostImages...');

    // Passo 3: Tentar PostImages como fallback
    steps.push('Tentando upload para PostImages...');
    const postImagesResult = await uploadToPostImages(conversionResult.pngBuffer);
    
    if (postImagesResult.success && postImagesResult.url) {
      steps.push('✅ Upload para PostImages realizado com sucesso');
      return {
        success: true,
        url: postImagesResult.url,
        steps
      };
    }
    
    steps.push('⚠️ PostImages não disponível, tentando FreeImage...');

    // Passo 4: Tentar FreeImage como fallback
    steps.push('Tentando upload para FreeImage...');
    const freeImageResult = await uploadToFreeImage(conversionResult.pngBuffer);
    
    if (freeImageResult.success && freeImageResult.url) {
      steps.push('✅ Upload para FreeImage realizado com sucesso');
      return {
        success: true,
        url: freeImageResult.url,
        steps
      };
    }
    
    steps.push('⚠️ FreeImage não disponível, tentando ImgBB...');

    // Passo 5: Tentar ImgBB como fallback
    steps.push('Tentando upload para ImgBB...');
    const imgbbResult = await uploadToImgBB(conversionResult.pngBuffer);
    
    if (imgbbResult.success && imgbbResult.url) {
      steps.push('✅ Upload para ImgBB realizado com sucesso');
      return {
        success: true,
        url: imgbbResult.url,
        steps
      };
    }
    
    steps.push('⚠️ ImgBB não disponível, tentando Imgur...');

    // Passo 6: Tentar Imgur como fallback
    steps.push('Tentando upload para Imgur...');
    const imgurResult = await uploadToImgur(conversionResult.pngBuffer);
    
    if (imgurResult.success && imgurResult.url) {
      steps.push('✅ Upload para Imgur realizado com sucesso');
      return {
        success: true,
        url: imgurResult.url,
        steps
      };
    }
    
    steps.push('⚠️ Imgur não disponível, tentando Telegraph...');

    // Passo 7: Tentar Telegraph como fallback
    steps.push('Tentando upload para Telegraph...');
    const telegraphResult = await uploadToTelegraph(conversionResult.pngBuffer);
    
    if (telegraphResult.success && telegraphResult.url) {
      steps.push('✅ Upload para Telegraph realizado com sucesso');
      return {
        success: true,
        url: telegraphResult.url,
        steps
      };
    }
    
    steps.push('⚠️ Todos os serviços de upload falharam, usando fallback de texto');

    // Passo 8: Fallback para texto quando todos os serviços falham
    steps.push('Gerando calendário em formato de texto...');
    
    // Extrair informações básicas do calendário do SVG
    const calendarText = extractCalendarTextFromSVG(svgString);
    
    return {
      success: false,
      steps,
      error: 'Todos os serviços de upload falharam',
      fallbackText: calendarText
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    steps.push(`❌ Erro no processo: ${errorMessage}`);
    
    return {
      success: false,
      steps,
      error: errorMessage
    };
  }
}

/**
 * Extrai informações básicas do calendário do SVG para fallback de texto
 */
function extractCalendarTextFromSVG(svgString: string): string {
  try {
    // Extrair mês e ano do SVG (simplificado)
    const currentMonth = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const currentMonthCapitalized = currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1);
    
    return `📅 CALENDÁRIO DE DISPONIBILIDADE

🗓️ ${currentMonthCapitalized}

⏰ HORÁRIOS DISPONÍVEIS:
• Segunda a Sexta: 08:00 - 18:00
• Sábado: 08:00 - 13:00
• Domingo: Fechado

📍 Para agendar, responda com:
• Data desejada (ex: 15/07)
• Ou selecione uma opção do menu

⚠️ Sujeito a disponibilidade`;
  } catch (error) {
    return '📅 CALENDÁRIO DE DISPONIBILIDADE\n\nPara agendar, entre em contato conosco pelo menu de opções.';
  }
}

/**
 * Função auxiliar para salvar PNG localmente (para debug)
 * @param pngBuffer - Buffer do PNG
 * @param filename - Nome do arquivo
 */
export async function savePngLocally(pngBuffer: Buffer, filename: string = 'calendar.png'): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, pngBuffer);
    console.log(`[Debug] PNG salvo localmente: ${filePath}`);
  } catch (error) {
    console.error('[Debug] Erro ao salvar PNG localmente:', error);
  }
}