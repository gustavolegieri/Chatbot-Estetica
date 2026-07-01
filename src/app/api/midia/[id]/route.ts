import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const item = await prisma.serviceMedia.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // delete file from disk
    try {
      const filePath = path.join(process.cwd(), 'public', item.path.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('failed to remove file', e);
    }

    await prisma.serviceMedia.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const item = await prisma.serviceMedia.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ data: item });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
