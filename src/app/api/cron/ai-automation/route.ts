import { NextRequest, NextResponse } from "next/server";
import { getAiAutomationReport } from "@/lib/ai-automation-report";
import { logAudit } from "@/lib/audit";
import { notifyPwaOperationalAlert } from "@/lib/pwa-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });

    const auth = request.headers.get("authorization");
    const querySecret = request.nextUrl.searchParams.get("secret");
    if ((auth?.replace(/^Bearer\s+/i, "") ?? querySecret) !== secret) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const report = await getAiAutomationReport();
    const { metrics } = report;
    const requiresAttention = metrics.priority > 0 || metrics.unanswered > 0 || metrics.queue > 2 || metrics.anomalyScore >= 35;
    let notification = { sent: 0, configured: false };

    if (requiresAttention) {
      notification = await notifyPwaOperationalAlert({
        title: metrics.priority > 0 ? `IA: ${metrics.priority} atendimento(s) prioritário(s)` : "IA: atenção na operação",
        body: report.executiveBrief,
        tag: "ai-daily-operation",
        url: "/admin/mobile?tab=ai",
        urgency: metrics.priority > 0 || metrics.anomalyScore >= 60 ? "high" : "normal",
      });
    }

    await logAudit({
      action: "AI_AUTOMATION_AUDIT",
      resource: "whatsapp-operation",
      data: { metrics, notification, requiresAttention, generatedAt: report.generatedAt },
    });

    return NextResponse.json({ ok: true, requiresAttention, notification, metrics });
  } catch (error) {
    console.error("[Cron/AI Automation] Falha isolada", error);
    return NextResponse.json({ ok: false, error: "Falha na auditoria automática" }, { status: 200 });
  }
}
