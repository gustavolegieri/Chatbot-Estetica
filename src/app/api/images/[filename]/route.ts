import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Validar o nome do arquivo para evitar path traversal
    if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    // Caminho do arquivo no diretório público
    const filePath = path.join(process.cwd(), 'public', 'tmp', filename);
    
    // Verificar se o arquivo existe
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Ler o arquivo
    const fileBuffer = await readFile(filePath);
    
    // Determinar o content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 
                      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                      ext === '.gif' ? 'image/gif' : 'image/png';

    // Retornar a imagem
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
      },
    });

  } catch (error) {
    console.error('[Image API] Erro ao servir imagem:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}