import { NextResponse } from 'next/server';
import { startCampaignProcessing } from '@/lib/campaign-processor';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
