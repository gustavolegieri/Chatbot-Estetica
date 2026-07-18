import { prisma } from '../src/lib/prisma';

(async () => {
  try {
    const id = 'ACA1FD217FCF1A6BEED8B1FBFE103DB6';
    const m = await prisma.whatsAppMessage.findUnique({ where: { wasenderMessageId: id } });
    console.log(JSON.stringify(m, null, 2));
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
