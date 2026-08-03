import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveCampaignAudience, type CampaignSelector } from "@/lib/campaign-audience";

const schema = z.object({
  type: z.enum(["all", "inactive", "service", "advanced"]),
  days: z.coerce.number().optional(),
  serviceId: z.string().optional(),
  authorizedOnly: z.boolean().optional(),
  neighborhood: z.string().optional(),
  vehicle: z.string().optional(),
  unreadOnly: z.boolean().optional(),
  handoffOnly: z.boolean().optional(),
  leadSource: z.string().optional(),
  appointmentStatus: z.enum(["any", "scheduled", "completed", "none"]).optional(),
  interactedWithinDays: z.coerce.number().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    const selector = schema.parse(await request.json());
    const audience = await resolveCampaignAudience(selector as CampaignSelector);
    return NextResponse.json({ success: true, data: {
      recipients: audience.recipients.length,
      totalClients: audience.totalClients,
      blocked: audience.blocked,
      sample: audience.recipients.slice(0, 5).map((item) => item.name),
    } });
  } catch {
    return NextResponse.json({ success: false, error: "Filtros inválidos" }, { status: 400 });
  }
}
