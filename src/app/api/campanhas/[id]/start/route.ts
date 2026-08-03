import { NextResponse } from 'next/server';
import { startCampaignProcessing } from '@/lib/campaign-processor';
import { getSession } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 });
  const { id } = await params;
  const { concurrency, delayMs } = await req.json().catch(() => ({}));

  try {
    await startCampaignProcessing(id, { concurrency, delayMs });
    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[campanha start]', err);
    return NextResponse.json({ success: false, error: 'Não foi possível iniciar a campanha.' }, { status: 500 });
  }
}
