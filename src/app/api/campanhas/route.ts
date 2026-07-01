import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const list = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ data: list });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, message, selector } = body; // selector: { type: 'all'|'inactive'|'service', days?, serviceId? }
    if (!name || !message || !selector) return NextResponse.json({ error: 'invalid' }, { status: 400 });

    const campaign = await prisma.campaign.create({ data: { name, message, selectorType: selector.type, selectorMeta: selector, status: 'DRAFT' } });

    // populate recipients based on selector
    let clients: any[] = [];
    if (selector.type === 'all') {
      clients = await prisma.client.findMany({ where: {} });
    } else if (selector.type === 'inactive') {
      const days = parseInt(String(selector.days || 30), 10);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // clients without appointments after cutoff
      clients = await prisma.client.findMany({ where: { appointments: { none: { date: { gt: cutoff } } } } });
    } else if (selector.type === 'service') {
      const serviceId = selector.serviceId;
      clients = await prisma.client.findMany({ where: { appointments: { some: { serviceId } } } });
    }

    const queueData = clients.map((c) => ({ campaignId: campaign.id, phone: c.phone, name: c.name }));
    if (queueData.length > 0) {
      await prisma.campaignQueue.createMany({ data: queueData });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { totalRecipients: queueData.length } });
    }

    return NextResponse.json({ data: { campaignId: campaign.id, recipients: queueData.length } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
