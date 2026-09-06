import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findRecurrenceCandidates, runRecurrenceCampaign } from "@/lib/recurrence-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authError(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json({ success: false, error: "Acesso restrito ao administrador." }, { status: 403 });
  }
  return null;
}

/** Fila que a recorrência enviaria agora, sem disparar nada. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return authError(error) ?? NextResponse.json({ success: false, error: "Erro de autenticação." }, { status: 500 });
  }

  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit"));
    const candidates = await findRecurrenceCandidates({
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    });
    return NextResponse.json({ success: true, data: candidates });
  } catch (error) {
    console.error("[Admin/Recorrência] Falha ao montar a fila:", error);
    return NextResponse.json({ success: false, error: "Não foi possível montar a fila." }, { status: 500 });
  }
}

/** Executa a campanha manualmente. `{ "dryRun": true }` apenas simula. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return authError(error) ?? NextResponse.json({ success: false, error: "Erro de autenticação." }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runRecurrenceCampaign({
      dryRun: body?.dryRun === true,
      limit: typeof body?.limit === "number" && body.limit > 0 ? body.limit : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Admin/Recorrência] Falha ao executar:", error);
    return NextResponse.json({ success: false, error: "Não foi possível executar a recorrência." }, { status: 500 });
  }
}
