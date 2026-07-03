import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import os from 'os';
import path from 'path';

function getUploadsDir() {
  if (process.env.NODE_ENV === 'production') {
    return path.join(os.tmpdir(), 'estetica-uploads');
  }
  return path.join(process.cwd(), 'public', 'uploads');
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as any;
    const serviceId = form.get('serviceId')?.toString();
    const filenameFromBody = form.get('filename');

    if (!file) {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    const arrayBuffer =
      typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : typeof file.stream === 'function'
        ? await new Response(file).arrayBuffer()
        : null;

    if (!arrayBuffer) {
      return NextResponse.json({ error: 'invalid_file' }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const mime = file.type || 'application/octet-stream';
    const filename =
      (typeof filenameFromBody === 'string' && filenameFromBody) ||
      file.name ||
      `upload-${Date.now()}`;

    const uploadsDir = getUploadsDir();
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const outPath = path.join(uploadsDir, safeName);
    fs.writeFileSync(outPath, buffer);

    const relPath = `/api/midia/file/${safeName}`;

    const media = await prisma.serviceMedia.create({
      data: {
        filename,
        path: relPath,
        mimeType: mime,
        size: buffer.length,
        serviceId,
      },
    });

    return NextResponse.json({ data: media });
  } catch (err: unknown) {
    console.error('[Midia Upload]', err);
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'server_error';
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'development' ? message : 'server_error',
      },
      { status: 500 }
    );
  }
}
