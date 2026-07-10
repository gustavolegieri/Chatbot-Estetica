import fs from "fs";
import { PrismaClient } from "@prisma/client";

const PROJECT_REF = "sunqmeqveevcjqfogqcw";
const env = fs.readFileSync(".env", "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
const u = new URL(m[1].trim().replace(/^postgresql:/, "postgres:"));
const enc = encodeURIComponent(decodeURIComponent(u.password));

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "sa-east-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-south-1",
];

const hosts = (region) => [`aws-0-${region}`, `aws-1-${region}`, `aws-${region}`];

for (const region of regions) {
  for (const host of hosts(region)) {
    for (const port of ["6543", "5432"]) {
      const q =
        port === "6543"
          ? "?pgbouncer=true&connection_limit=1&sslmode=require"
          : "?sslmode=require";
      const url = `postgresql://postgres.${PROJECT_REF}:${enc}@${host}.pooler.supabase.com:${port}/postgres${q}`;
      const prisma = new PrismaClient({ datasources: { db: { url } } });
      try {
        await prisma.$queryRaw`SELECT 1`;
        console.log("SUCCESS", { host, port, region });
        console.log(url);
        await prisma.$disconnect();
        process.exit(0);
      } catch (e) {
        const msg = (e.message || "").replace(/\s+/g, " ").slice(0, 70);
        if (!/ENOTFOUND|Can't reach|Tenant|tenant/i.test(msg)) {
          console.log("?", host, port, msg);
        }
      }
      await prisma.$disconnect();
    }
  }
}
console.log("No pooler region found");
