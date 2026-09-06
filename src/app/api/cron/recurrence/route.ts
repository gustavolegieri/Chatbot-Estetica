import { NextRequest, NextResponse } from "next/server";
import { runRecurrenceCampaign } from "@/lib/recurrence-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }

  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = request.nextUrl.searchParams.get("secret");
  if ((auth || query) !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    // `?dryRun=1` simula a fila sem enviar nada e sem exigir a automação ligada.
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const result = await runRecurrenceCampaign({ dryRun });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Cron/Recorrência] Erro não tratado:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha na recorrência" },
      { status: 200 }
    );
  }
}
