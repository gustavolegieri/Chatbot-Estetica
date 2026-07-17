import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Carregar .env.test explicitamente
const envConfig = config({ path: '.env.test' });
process.env.DATABASE_URL = envConfig.parsed?.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/estetica_automotiva?schema=public';

const prisma = new PrismaClient();
const TEST_PHONE = '5511972851072';

async function cleanup() {
  try {
    console.log('🧹 Limpando dados de teste...');
    
    await prisma.whatsAppSession.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    await prisma.whatsAppMessage.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    console.log('✅ Dados de teste limpos');
  } catch (error) {
    console.error('❌ Erro ao limpar dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
