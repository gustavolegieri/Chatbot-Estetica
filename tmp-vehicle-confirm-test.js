require('dotenv').config({ path: '.env.test' });
process.env.TEST_MODE = 'true';
process.env.WASENDER_API_KEY = '';
const { PrismaClient } = require('@prisma/client');
const { processWhatsAppMessage } = require('./src/lib/whatsapp-bot');
const { normalizePhone } = require('./src/lib/utils');
const prisma = new PrismaClient();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const phone = '5511972851072';
  const normalized = normalizePhone(phone);
  await prisma.whatsAppSession.deleteMany({ where: { phone: normalized } });
  await prisma.whatsAppMessage.deleteMany({ where: { phone } });

  const inputs = [
    'Oi',
    'João',
    '1',
    '1',
    '1',
    'Civic 2022',
    'prata',
    'bom',
    'sim',
  ];

  for (const text of inputs) {
    console.log('Sending:', text);
    await processWhatsAppMessage({ phone, text, pushName: 'Teste' });
    await sleep(500);
    const last = await prisma.whatsAppMessage.findFirst({
      where: { phone, direction: 'OUTBOUND', sender: 'BOT' },
      orderBy: { createdAt: 'desc' },
    });
    console.log('Last bot message:', last?.body?.slice(0, 200));
    const session = await prisma.whatsAppSession.findUnique({ where: { phone: normalized } });
    console.log('Session stage:', session?.metadata?.stage);
  }

  const session = await prisma.whatsAppSession.findUnique({ where: { phone: normalized } });
  console.log('Final stage:', session?.metadata?.stage);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
