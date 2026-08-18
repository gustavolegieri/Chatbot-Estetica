import { NextRequest, NextResponse } from "next/server";
import { generateGateDailyReport } from "@/lib/gate-daily-report";
import { notifyPwaOperationalAlert } from "@/lib/pwa-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("secret");
  if (provided !== secret) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const report = await generateGateDailyReport();
    if (report.reused !== true) {
      await notifyPwaOperationalAlert({
        title: `Resumo da garagem · ${report.date}`,
        body: String(report.summary),
        tag: `gate-daily-${report.date}`,
        url: "/admin/gate-vision",
        urgency: Number((report.metrics as Record<string, unknown>).cameraFailures || 0) > 0 ? "high" : "normal",
      });
    }
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("[Cron/Gate Report] Falha isolada", error);
    return NextResponse.json({ ok: false, error: "Falha no relatório diário da garagem" }, { status: 200 });
  }
}
