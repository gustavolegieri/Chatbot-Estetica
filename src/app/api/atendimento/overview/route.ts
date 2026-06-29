import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAtendimentoOverview } from "@/lib/atendimento-analytics";
import { flowStageLabel } from "@/lib/flow-stage-labels";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const data = await getAtendimentoOverview();

  const funnel = Object.entries(data.funnelStages)
    .map(([stage, count]) => ({ stage, label: flowStageLabel(stage), count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    success: true,
    data: {
      ...data,
      funnel,
      totalHandoffs: data.pendingHandoffs + data.inProgressHandoffs,
    },
  });
}
