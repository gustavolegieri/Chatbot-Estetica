import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || '200');
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json({ success: true, data: logs });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
