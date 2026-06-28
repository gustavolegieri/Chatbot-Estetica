import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const env = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
const full = m[1].trim();

const variants = [
  { label: "full", url: full },
  {
    label: "minimal (só pgbouncer)",
    url: full.replace(/\&connection_limit=\d+/, "").replace(/\&sslmode=require/, ""),
  },
  {
    label: "sem query string",
    url: full.split("?")[0],
  },
];

for (const { label, url } of variants) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("OK", label, "len", url.length);
  } catch (e) {
    console.log("FAIL", label, e.message?.slice(0, 60));
  }
  await prisma.$disconnect();
}
