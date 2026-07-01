import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as any;
    const serviceId = form.get('serviceId')?.toString();

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'no_file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = file.type || 'application/octet-stream';
    const filename = file.name || `upload-${Date.now()}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const outPath = path.join(uploadsDir, safeName);
    fs.writeFileSync(outPath, buffer);

    const relPath = `/uploads/${safeName}`;

    const media = await prisma.serviceMedia.create({ data: { filename, path: relPath, mimeType: mime, size: buffer.length, serviceId } });

    return NextResponse.json({ data: media });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
