import { NextResponse } from 'next/server';
import { startCampaignProcessing } from '@/lib/campaign-processor';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { concurrency, delayMs } = await req.json().catch(() => ({}));
  try {
    startCampaignProcessing(params.id, { concurrency, delayMs });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
