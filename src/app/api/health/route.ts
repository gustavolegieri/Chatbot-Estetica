import { NextResponse } from "next/server";
import { analyzeDatabaseUrl } from "@/lib/database-url";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** GET /api/health — teste rápido de env e banco (sem expor segredos) */
export async function GET() {
  const urlAnalysis = analyzeDatabaseUrl(process.env.DATABASE_URL);

  const checks = {
    databaseUrl: !!process.env.DATABASE_URL,
    jwtSecret: !!process.env.JWT_SECRET,
    db: false as boolean,
    adminUser: false as boolean,
    hint: "" as string,
    urlHost: urlAnalysis.host || undefined,
    urlPort: urlAnalysis.port || undefined,
  };

  if (urlAnalysis.hints.length > 0) {
    checks.hint = urlAnalysis.hints.join(" ");
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
    const admin = await prisma.user.findUnique({ where: { email: "admin@estetica.com" } });
    checks.adminUser = !!admin?.active;
    if (checks.db && !checks.adminUser) {
      checks.hint = "Banco OK, mas admin não existe. Rode: npm run db:seed no PC.";
    }
  } catch (e) {
    console.error("[health]", e);
    const msg = e instanceof Error ? e.message : "";
    if (/Can't reach database|P1001|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
      checks.hint =
        checks.hint ||
        "Banco inacessível. Na Vercel use: db.rifvdutsxappnlroennh.supabase.co:6543 com ?pgbouncer=true (veja docs/SUPABASE-VERCEL.md).";
    } else if (!checks.hint) {
      checks.hint = "Erro ao conectar ao banco. Confira DATABASE_URL na Vercel.";
    }
  }

  const ok = checks.databaseUrl && checks.jwtSecret && checks.db && checks.adminUser;

  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
