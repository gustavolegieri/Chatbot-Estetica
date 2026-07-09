import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTestBotEvaluationMetrics } from "@/lib/test-bot-evaluation-store";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const metrics = getTestBotEvaluationMetrics();
    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Acesso negado." },
      { status: 403 }
    );
  }
}
