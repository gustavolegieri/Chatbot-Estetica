/**
 * Serviço de upload de imagens usando Cloudinary e Imgur
 * Resolve o problema de hospedagem de imagens para envio via WhatsApp
 */

import { v2 as cloudinary } from 'cloudinary';
import FormData from 'form-data';
import fetch from 'node-fetch';

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Faz upload de um buffer de imagem para o Cloudinary usando unsigned upload preset via API REST
 * @param imageBuffer - Buffer da imagem
 * @param filename - Nome do arquivo (opcional)
 * @param folder - Pasta no Cloudinary (opcional, padrão: 'calendars')
 * @returns URL pública da imagem ou erro
 */
export async function uploadImageToCloudinary(
  imageBuffer: Buffer,
  filename?: string,
  folder: string = 'calendars'
): Promise<UploadResult> {
  try {
    // Verificar se Cloudinary está configurado
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.warn('[Cloudinary] Não configurado - usando fallback local');
      return {
        success: false,
        error: 'Cloudinary não configurado'
      };
    }

    console.log('[Cloudinary] Tentando upload via unsigned preset (API REST)...');
    console.log('[Cloudinary] Cloud name:', process.env.CLOUDINARY_CLOUD_NAME);
    
    // Usar unsigned preset (configurado no painel do Cloudinary)
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || 'unsigned_preset';
    
    // Gerar nome único
    const timestamp = Date.now();
    const publicId = filename 
      ? `calendar-${filename.replace(/\.[^/.]+$/, '')}-${timestamp}`
      : `calendar-${timestamp}`;

    // Converter buffer para base64
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    // Criar FormData para upload via API REST
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('upload_preset', uploadPreset);
    formData.append('public_id', publicId);
    formData.append('folder', folder);

    // Fazer upload via API REST (não precisa de API key/secret para unsigned)
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const response = await Promise.race([
      fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Cloudinary] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[Cloudinary] Upload realizado com sucesso via API REST');
    console.log('[Cloudinary] URL:', result.secure_url);
    
    return {
      success: true,
      url: result.secure_url
    };

  } catch (error) {
    console.warn('[Cloudinary] Upload falhou, usando fallback local:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Upload para Imgur (alternativa gratuita ao Cloudinary)
 * @param imageBuffer - Buffer da imagem
 * @returns URL pública da imagem ou erro
 */
export async function uploadToImgur(imageBuffer: Buffer): Promise<UploadResult> {
  try {
    console.log('[Imgur] Tentando upload...');
    
    // Converter buffer para base64
    const base64Image = imageBuffer.toString('base64');
    
    const response = await Promise.race([
      fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
          'Authorization': 'Client-ID 7c2c6d1d9c7e4f3', // Client ID público para testes
        },
        body: JSON.stringify({
          image: base64Image,
          type: 'base64'
        }),
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Imgur] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[Imgur] Upload realizado com sucesso');
    
    return {
      success: true,
      url: result.data.link
    };

  } catch (error) {
    console.warn('[Imgur] Upload falhou:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Upload para temporary file hosting service (telegra.ph)
 * @param imageBuffer - Buffer da imagem
 * @returns URL pública da imagem ou erro
 */
export async function uploadToTelegraph(imageBuffer: Buffer): Promise<UploadResult> {
  try {
    console.log('[Telegraph] Tentando upload...');
    
    const formData = new FormData();
    formData.append('file', imageBuffer, {
      filename: 'calendar.png',
      contentType: 'image/png'
    });

    const response = await Promise.race([
      fetch('https://telegra.ph/upload', {
        method: 'POST',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Telegraph] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('[Telegraph] Upload realizado com sucesso');
    
    return {
      success: true,
      url: `https://telegra.ph${result[0].src}`
    };

  } catch (error) {
    console.warn('[Telegraph] Upload falhou:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Upload para ImgBB (serviço gratuito e confiável)
 * @param imageBuffer - Buffer da imagem
 * @returns URL pública da imagem ou erro
 */
export async function uploadToImgBB(imageBuffer: Buffer): Promise<UploadResult> {
  try {
    console.log('[ImgBB] Tentando upload...');
    
    // Converter buffer para base64
    const base64Image = imageBuffer.toString('base64');
    
    // Usar a API key pública do ImgBB (gratuita para uso pessoal)
    const apiKey = '4d8fcfb6c70e1ea9e27a397d21e12fd8'; // API key pública
    
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', base64Image);

    const response = await Promise.race([
      fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ImgBB] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error?.message || 'Erro no upload ImgBB');
    }
    
    console.log('[ImgBB] Upload realizado com sucesso');
    
    return {
      success: true,
      url: result.data.url
    };

  } catch (error) {
    console.warn('[ImgBB] Upload falhou:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Upload para freeimage.host (gratuito, sem API key)
 * @param imageBuffer - Buffer da imagem
 * @returns URL pública da imagem ou erro
 */
export async function uploadToFreeImage(imageBuffer: Buffer): Promise<UploadResult> {
  try {
    console.log('[FreeImage] Tentando upload...');
    
    const formData = new FormData();
    formData.append('source', imageBuffer, {
      filename: 'calendar.png',
      contentType: 'image/png'
    });
    formData.append('type', 'file');
    formData.append('action', 'upload');

    const response = await Promise.race([
      fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[FreeImage] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.status_code !== 200) {
      throw new Error(result.error?.message || 'Erro no upload FreeImage');
    }
    
    console.log('[FreeImage] Upload realizado com sucesso');
    
    return {
      success: true,
      url: result.image.url
    };

  } catch (error) {
    console.warn('[FreeImage] Upload falhou:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Upload para postimages.org (gratuito, sem API key)
 * @param imageBuffer - Buffer da imagem
 * @returns URL pública da imagem ou erro
 */
export async function uploadToPostImages(imageBuffer: Buffer): Promise<UploadResult> {
  try {
    console.log('[PostImages] Tentando upload...');
    
    const formData = new FormData();
    formData.append('upload', imageBuffer, {
      filename: 'calendar.png',
      contentType: 'image/png'
    });
    formData.append('token', ''); // Vazio para upload sem conta
    formData.append('gallery', '');
    formData.append('nn', '');
    formData.append('upload_session', '');

    const response = await Promise.race([
      fetch('https://postimages.org/api/upload', {
        method: 'POST',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 20000)
      )
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PostImages] Erro na resposta:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    if (result.status !== 'OK') {
      throw new Error(result.error || 'Erro no upload PostImages');
    }
    
    console.log('[PostImages] Upload realizado com sucesso');
    
    return {
      success: true,
      url: result.url
    };

  } catch (error) {
    console.warn('[PostImages] Upload falhou:', error instanceof Error ? error.message : error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido no upload'
    };
  }
}

/**
 * Fazer upload de arquivo local para Cloudinary
 * @param filePath - Caminho do arquivo local
 * @returns URL pública da imagem ou erro
 */
export async function uploadLocalFileToCloudinary(
  filePath: string
): Promise<UploadResult> {
  try {
    const fs = await import('fs');
    const buffer = fs.readFileSync(filePath);
    return await uploadImageToCloudinary(buffer);
  } catch (error) {
    console.error('[Cloudinary] Erro ao ler arquivo local:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao ler arquivo'
    };
  }
}