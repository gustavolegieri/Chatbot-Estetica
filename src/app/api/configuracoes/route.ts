import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidateCatalogCache } from "@/lib/whatsapp-service-catalog";

const updateSchema = z.object({
  businessName: z.string().optional(),
  businessPhone: z.string().optional().nullable(),
  businessAddress: z.string().optional().nullable(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  lunchBreakStart: z.string().optional().nullable(),
  lunchBreakEnd: z.string().optional().nullable(),
  slotDurationMin: z.number().int().positive().optional(),
  workingDays: z.string().optional(),
  whatsappEnabled: z.boolean().optional(),
  whatsappWelcomeMsg: z.string().optional(),
  evolutionApiUrl: z.string().optional().nullable(),
  evolutionApiKey: z.string().optional().nullable(),
  evolutionInstanceName: z.string().optional().nullable(),
  pixKey: z.string().optional().nullable(),
  pixHolderName: z.string().optional().nullable(),
  pixBank: z.string().optional().nullable(),
  sessionResetMin: z.number().int().positive().optional(),
  followupIdleMin: z.number().int().positive().optional(),
  reminder4hMin: z.number().int().positive().optional(),
  reminder30minMin: z.number().int().positive().optional(),
  autoCancelMin: z.number().int().positive().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  return NextResponse.json({ success: true, data: settings });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = updateSchema.parse(body);

    const settings = await prisma.settings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    invalidateCatalogCache();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Dados inválidos. Verifique horários e duração do slot." },
        { status: 400 }
      );
    }
    console.error("[configuracoes PUT]", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar" }, { status: 500 });
  }
}
