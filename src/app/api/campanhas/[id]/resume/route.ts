import { NextResponse } from 'next/server';
import { resumeCampaign } from '@/lib/campaign-processor';
import { getSession } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
  const { id } = await params;
  const { concurrency, delayMs } = await req.json().catch(() => ({}));
  try {
    await resumeCampaign(id, { concurrency, delayMs });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
