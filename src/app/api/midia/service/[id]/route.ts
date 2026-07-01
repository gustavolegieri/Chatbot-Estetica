import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: serviceId } = await params;
  try {
    const list = await prisma.serviceMedia.findMany({ where: { serviceId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ data: list });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
