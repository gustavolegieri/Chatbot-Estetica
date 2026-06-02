import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const PROJECT_REF = "rifvdutsxappnlroennh";
const env = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error("DATABASE_URL missing");
const direct = m[1].trim().replace(/^["']|["']$/g, "");
const u = new URL(direct.replace(/^postgresql:/, "postgres:"));
const encodedPassword = encodeURIComponent(decodeURIComponent(u.password));

const candidates = [
  {
    label: "PgBouncer no host db (6543)",
    url: `postgresql://postgres:${encodedPassword}@db.${PROJECT_REF}.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`,
  },
  {
    label: "Session pooler aws (sem 0)",
    url: `postgresql://postgres.${PROJECT_REF}:${encodedPassword}@aws-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  },
  {
    label: "Transaction aws-us-east-1",
    url: `postgresql://postgres.${PROJECT_REF}:${encodedPassword}@aws-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`,
  },
  {
    label: "Transaction aws-0-us-east-1",
    url: `postgresql://postgres.${PROJECT_REF}:${encodedPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`,
  },
  {
    label: "Transaction aws-1-us-east-1",
    url: `postgresql://postgres.${PROJECT_REF}:${encodedPassword}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require`,
  },
  {
    label: "Session sa-east-1 aws-0",
    url: `postgresql://postgres.${PROJECT_REF}:${encodedPassword}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
  },
];

for (const { label, url } of candidates) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    console.log("OK:", label);
    console.log(url);
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("FAIL:", label, "-", msg.replace(/\n/g, " ").slice(0, 120));
    await prisma.$disconnect();
  }
}
console.log("\nCopie a URL em Supabase → Project → Connect → Transaction pooler.");
