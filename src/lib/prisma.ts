import { PrismaClient } from "@prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = getRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl
      ? { 
          datasources: { db: { url: databaseUrl } },
          // Aumentar pool de conexões para lidar com requisições simultâneas
          // Em serverless (Vercel), isso é crucial para evitar timeouts
          connectionLimit: 10,
        }
      : {}),
  });

// Evita múltiplas conexões no serverless (Vercel)
globalForPrisma.prisma = prisma;
