import { NextRequest, NextResponse } from "next/server";
import { runInstagramStoriesCron } from "@/lib/instagram-automation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron horário (Vercel): casa com publishTimes em America/Sao_Paulo
 * e publica até 3 Stories/dia (manhã/tarde/noite).
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
    }

    const auth = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    const token = auth?.replace(/^Bearer\s+/i, "") ?? querySecret;
    if (token !== secret) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const result = await runInstagramStoriesCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Cron/Instagram Stories]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 200 }
    );
  }
}
