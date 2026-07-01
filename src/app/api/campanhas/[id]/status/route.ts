import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const counts = await prisma.campaignQueue.groupBy({ by: ['status'], where: { campaignId: params.id }, _count: { status: true } });
    const map: any = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0 };
    for (const c of counts) map[c.status] = c._count.status;
    return NextResponse.json({ data: { campaign, counts: map } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
