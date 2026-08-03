import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { phoneToWhatsApp } from "@/lib/utils";
import { normalizeJundiaiMobile } from "@/lib/jundiai-lead";
import { submitLeadToHubSpot } from "@/lib/hubspot-leads";

export const dynamic = "force-dynamic";

const serviceLabels: Record<string, string> = {
  lavagem: "Lavagem e cuidado externo",
  polimento: "Polimento e correção",
  protecao: "Proteção de pintura",
  higienizacao: "Higienização interna",
  avaliacao: "Avaliação estética",
};

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().min(10).max(24),
  neighborhood: z.string().trim().max(80).optional().default(""),
  vehicle: z.string().trim().min(2).max(100),
  service: z.enum(["lavagem", "polimento", "protecao", "higienizacao", "avaliacao"]),
  source: z.string().trim().max(60).optional().default("pagina-jundiai"),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(""),
});

const attempts = new Map<string, { count: number; expiresAt: number }>();

function allowed(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.expiresAt <= now) {
    attempts.set(ip, { count: 1, expiresAt: now + 60 * 60 * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= 5;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowed(ip)) {
    return NextResponse.json({ success: false, error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }

  try {
    const input = schema.parse(await request.json());
    const phone = normalizeJundiaiMobile(input.phone);
    if (!phone) {
      return NextResponse.json({ success: false, error: "Informe um celular válido com DDD 11." }, { status: 400 });
    }

    const now = new Date();
    const serviceLabel = serviceLabels[input.service];
    const existingSession = await prisma.whatsAppSession.findUnique({ where: { phone } });
    const oldMetadata = existingSession?.metadata && typeof existingSession.metadata === "object"
      ? (existingSession.metadata as Record<string, unknown>)
      : {};

    const client = await prisma.client.upsert({
      where: { phone },
      create: {
        name: input.name,
        phone,
        vehicleModel: input.vehicle,
        address: input.neighborhood ? `${input.neighborhood}, Jundiaí - SP` : "Jundiaí - SP",
        notes: "Lead captado com autorização pela página de Jundiaí.",
      },
      update: {
        name: input.name,
        vehicleModel: input.vehicle,
        address: input.neighborhood ? `${input.neighborhood}, Jundiaí - SP` : undefined,
      },
    });

    // O CRM local é a fonte principal. Uma falha externa nunca descarta o lead.
    const hubspot = await submitLeadToHubSpot({
      name: input.name,
      phone,
      city: "Jundiaí",
      ipAddress: ip === "unknown" ? undefined : ip,
      pageUri: request.headers.get("referer") || `${request.nextUrl.origin}/jundiai`,
    });

    const metadata = {
      ...oldMetadata,
      stage: "ETAPA1_AWAITING_NAME",
      welcomed: false,
      customerName: input.name,
      vehicleModel: input.vehicle,
      serviceLabel,
      serviceRequestContext: serviceLabel,
      crmColumn: "new",
      leadSource: input.source || "pagina-jundiai",
      leadCity: "Jundiaí",
      leadNeighborhood: input.neighborhood || undefined,
      marketingConsent: true,
      marketingConsentAt: now.toISOString(),
      marketingConsentText: "Autorizo contato da Garagem do Ka pelo WhatsApp sobre avaliação, orçamento e agendamento.",
      leadCapturedAt: now.toISOString(),
      hubspotConfigured: hubspot.configured,
      hubspotSyncedAt: hubspot.synced ? now.toISOString() : undefined,
      hubspotSyncError: hubspot.configured && !hubspot.synced
        ? hubspot.error || `HTTP ${hubspot.status ?? "desconhecido"}`
        : undefined,
    };

    await prisma.whatsAppSession.upsert({
      where: { phone },
      create: {
        phone,
        clientId: client.id,
        metadata: metadata as Prisma.InputJsonValue,
        lastStage: "ETAPA1_AWAITING_NAME",
        lastMessagePreview: `Lead captado: ${serviceLabel}`,
        unreadCount: 1,
      },
      update: {
        clientId: client.id,
        metadata: metadata as Prisma.InputJsonValue,
        lastStage: "ETAPA1_AWAITING_NAME",
        lastMessagePreview: `Lead captado: ${serviceLabel}`,
        unreadCount: { increment: 1 },
      },
    });

    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: { businessPhone: true },
    });
    const businessPhone = settings?.businessPhone ? phoneToWhatsApp(settings.businessPhone) : "";
    const message = `Olá! Sou ${input.name}, de Jundiaí. Tenho um ${input.vehicle} e quero saber mais sobre ${serviceLabel.toLowerCase()}.`;

    return NextResponse.json({
      success: true,
      data: {
        hubspotSynced: hubspot.synced,
        whatsappUrl: businessPhone
          ? `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`
          : null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Revise os dados e confirme a autorização." }, { status: 400 });
    }
    console.error("[Public Lead Capture]", error);
    return NextResponse.json({ success: false, error: "Não foi possível registrar agora. Tente novamente." }, { status: 500 });
  }
}
