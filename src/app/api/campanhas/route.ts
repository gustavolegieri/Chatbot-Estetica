import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const list = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ success: true, data: list });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, message, selector } = body;

    if (!name || !message || !selector?.type) {
      return NextResponse.json({ success: false, error: 'Preencha nome, mensagem e o critério da campanha.' }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: String(name).trim(),
        message: String(message).trim(),
        selectorType: selector.type,
        selectorMeta: selector,
        status: 'DRAFT',
      },
    });

    let clients: Array<{ phone: string; name: string | null }> = [];
    if (selector.type === 'all') {
      clients = await prisma.client.findMany({ where: {}, select: { phone: true, name: true } });
    } else if (selector.type === 'inactive') {
      const days = Math.max(1, parseInt(String(selector.days || 30), 10));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      clients = await prisma.client.findMany({
        where: { appointments: { none: { date: { gt: cutoff } } } },
        select: { phone: true, name: true },
      });
    } else if (selector.type === 'service') {
      const serviceId = String(selector.serviceId || '').trim();
      if (!serviceId) {
        return NextResponse.json({ success: false, error: 'Selecione um serviço válido.' }, { status: 400 });
      }
      clients = await prisma.client.findMany({
        where: { appointments: { some: { serviceId } } },
        select: { phone: true, name: true },
      });
    }

    const queueData = clients.map((c) => ({ campaignId: campaign.id, phone: c.phone, name: c.name }));
    if (queueData.length > 0) {
      await prisma.campaignQueue.createMany({ data: queueData });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { totalRecipients: queueData.length } });
    }

    return NextResponse.json({ success: true, data: { campaignId: campaign.id, recipients: queueData.length } });
  } catch (err) {
    console.error('[campanhas POST]', err);
    return NextResponse.json({ success: false, error: 'Não foi possível criar a campanha.' }, { status: 500 });
  }
}
