import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveCampaignAudience, type CampaignSelector } from "@/lib/campaign-audience";

const selectorSchema = z.object({
  type: z.enum(["all", "inactive", "service", "advanced"]),
  days: z.coerce.number().int().min(1).max(730).optional(),
  serviceId: z.string().max(100).optional(),
  authorizedOnly: z.boolean().optional().default(true),
  neighborhood: z.string().trim().max(80).optional(),
  vehicle: z.string().trim().max(80).optional(),
  unreadOnly: z.boolean().optional(),
  handoffOnly: z.boolean().optional(),
  leadSource: z.string().trim().max(60).optional(),
  appointmentStatus: z.enum(["any", "scheduled", "completed", "none"]).optional(),
  interactedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  message: z.string().trim().min(5).max(1200),
  selector: selectorSchema,
  confirmedAuthorized: z.literal(true),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const list = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ success: true, data: list });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  try {
    const input = createSchema.parse(await request.json());
    if (input.selector.type === "service" && !input.selector.serviceId) {
      return NextResponse.json({ success: false, error: "Selecione um serviço válido." }, { status: 400 });
    }
    const audience = await resolveCampaignAudience(input.selector as CampaignSelector);
    const campaign = await prisma.campaign.create({
      data: {
        name: input.name,
        message: input.message,
        selectorType: input.selector.type,
        selectorMeta: input.selector,
        status: "DRAFT",
        createdById: session.userId,
        totalRecipients: audience.recipients.length,
        queue: { create: audience.recipients.map((recipient) => ({ phone: recipient.phone, name: recipient.name })) },
      },
    });
    return NextResponse.json({ success: true, data: { campaignId: campaign.id, recipients: audience.recipients.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Revise os filtros e confirme que os contatos podem receber a campanha." }, { status: 400 });
    }
    console.error("[Campanhas POST]", error);
    return NextResponse.json({ success: false, error: "Não foi possível criar a campanha." }, { status: 500 });
  }
}
