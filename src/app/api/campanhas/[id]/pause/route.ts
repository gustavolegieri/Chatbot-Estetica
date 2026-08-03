import { NextResponse } from 'next/server';
import { pauseCampaign } from '@/lib/campaign-processor';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
  const { id } = await params;
  try {
    await pauseCampaign(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
