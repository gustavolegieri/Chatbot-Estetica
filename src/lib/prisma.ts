import { PrismaClient } from "@prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = getRuntimeDatabaseUrl();

// Log de inicialização para confirmar connection_limit em uso (mascarando credenciais)
if (!globalForPrisma.prisma && databaseUrl) {
  const maskedUrl = databaseUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  const connectionLimit = databaseUrl.match(/connection_limit=(\d+)/)?.[1] || 'not set';
  console.log('[Prisma] Initializing with connection_limit:', connectionLimit);
  console.log('[Prisma] Database URL (masked):', maskedUrl);
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl
      ? { 
          datasources: { db: { url: databaseUrl } },
        }
      : {}),
  });

// Evita múltiplas conexões no serverless (Vercel)
globalForPrisma.prisma = prisma;
