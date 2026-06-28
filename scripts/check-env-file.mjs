import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { analyzeDatabaseUrl, repairDatabaseUrl } from "../src/lib/database-url.ts";

const file = process.argv[2] || ".env.vercel.production";
const env = fs.readFileSync(path.join(process.cwd(), file), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) {
  console.log("NO DATABASE_URL in", file);
  process.exit(1);
}
const raw = m[1].trim().replace(/^["']|["']$/g, "");
const analysis = analyzeDatabaseUrl(raw);
const repaired = repairDatabaseUrl(raw);
console.log("file:", file);
console.log("analysis:", JSON.stringify(analysis, null, 2));
console.log("repairedChanged:", raw !== repaired);
console.log("repairedHasPgbouncer:", repaired?.includes("pgbouncer=true"));

const prisma = new PrismaClient({ datasources: { db: { url: repaired ?? raw } } });
try {
  await prisma.$queryRaw`SELECT 1`;
  const admin = await prisma.user.findUnique({ where: { email: "admin@estetica.com" } });
  console.log("DB_CONNECT: OK", "admin:", !!admin?.active);
} catch (e) {
  console.log("DB_CONNECT: FAIL", e.message?.slice(0, 150));
}
await prisma.$disconnect();
