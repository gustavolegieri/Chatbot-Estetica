import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get('serviceId');
  const where = serviceId ? { serviceId } : {};
  const list = await prisma.serviceMedia.findMany({ where, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ data: list });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dataUrl, filename, serviceId } = body;
    if (!dataUrl || !filename) return NextResponse.json({ error: 'invalid' }, { status: 400 });

    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return NextResponse.json({ error: 'invalid_dataurl' }, { status: 400 });

    const mime = matches[1];
    const b64 = matches[2];
    const buffer = Buffer.from(b64, 'base64');

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
