import { prisma } from '../src/lib/prisma';

(async () => {
  try {
    const phone = '5511972851072';
    const msgs = await prisma.whatsAppMessage.findMany({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    console.log(msgs.map(m => ({ id: m.id, wasenderMessageId: m.wasenderMessageId, direction: m.direction, body: m.body, createdAt: m.createdAt })).slice(0,30));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
