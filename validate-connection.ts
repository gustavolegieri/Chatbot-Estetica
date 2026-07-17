import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Carregar .env.test explicitamente ANTES de qualquer outro
const envConfig = dotenv.config({ path: '.env.test' });

// Forçar DATABASE_URL do .env.test
process.env.DATABASE_URL = envConfig.parsed?.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/estetica_automotiva?schema=public';

const prisma = new PrismaClient();

async function validateConnection() {
  try {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    console.log('Testando conexão com banco de dados...');
    
    // Query simples para validar conexão
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Conexão bem-sucedida:', result);
    
    // Verificar se tabela WhatsAppSession existe
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tabelas no banco:', tables);
    
  } catch (error) {
    console.error('❌ Erro na conexão:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

validateConnection();
