import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const env = fs.readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

loadEnv();
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const user = await prisma.user.findUnique({
  where: { email: "admin@estetica.com", active: true },
});
if (!user) {
  console.log("NO_USER");
  process.exit(1);
}
const ok = await bcrypt.compare("admin123", user.password);
console.log(ok ? "LOGIN_OK" : "BAD_PASSWORD");
await prisma.$disconnect();
