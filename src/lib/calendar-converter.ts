/**
 * Conversão de SVG para PNG e envio via WasenderAPI
 * Resolve o problema do WhatsApp não renderizar SVG inline
 */

import sharp from 'sharp';

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
 * e retorna a URL pública relativa
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
    
    // Retornar URL pública relativa
    const publicUrl = `/tmp/${safeFilename}`;
    console.log('[Upload] URL pública gerada:', publicUrl);
    
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
 * Processo completo: SVG → PNG → Upload local → URL pública
 * @param svgString - String do SVG
 * @param filename - Nome do arquivo (opcional)
 * @param conversionOptions - Opções de conversão
 * @returns Resultado completo do processo com URL pública
 */
export async function convertAndUploadCalendar(
  svgString: string,
  filename?: string,
  conversionOptions: ConversionOptions = {}
): Promise<{ success: boolean; url?: string; steps: string[]; error?: string }> {
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

    // Passo 2: Fazer upload para diretório público
    steps.push('Salvando PNG no diretório público...');
    const uploadResult = await uploadPngToStorage(conversionResult.pngBuffer, filename);
    
    if (!uploadResult.success || !uploadResult.url) {
      steps.push('❌ Falha no upload da imagem');
      return {
        success: false,
        steps,
        error: uploadResult.error || 'Falha no upload'
      };
    }
    
    steps.push('✅ Upload realizado com sucesso');
    
    return {
      success: true,
      url: uploadResult.url,
      steps
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