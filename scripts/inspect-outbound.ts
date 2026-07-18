import { prisma } from '../src/lib/prisma';

(async () => {
  try {
    const phone = '5511972851072';
    const msgs = await prisma.whatsAppMessage.findMany({
      where: { phone, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log(msgs.map(m => ({ id: m.id, wasenderMessageId: m.wasenderMessageId, body: m.body, createdAt: m.createdAt, deliveryStatus: (m as any).deliveryStatus, error: (m as any).error })).slice(0,10));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
