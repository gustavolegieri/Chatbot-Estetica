import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** GET /api/health — teste rápido de env e banco (sem expor segredos) */
export async function GET() {
  const checks = {
    databaseUrl: !!process.env.DATABASE_URL,
    jwtSecret: !!process.env.JWT_SECRET,
    db: false as boolean,
    adminUser: false as boolean,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
    const admin = await prisma.user.findUnique({ where: { email: "admin@estetica.com" } });
    checks.adminUser = !!admin?.active;
  } catch (e) {
    console.error("[health]", e);
  }

  const ok = checks.databaseUrl && checks.jwtSecret && checks.db && checks.adminUser;

  return NextResponse.json(
    { ok, checks },
    { status: ok ? 200 : 503 }
  );
}
