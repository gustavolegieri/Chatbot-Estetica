import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadWhatsAppCatalog, buildMainMenu } from "@/lib/whatsapp-service-catalog";
import { loadPromptMap } from "@/lib/bot-prompts";
import { etapa1Welcome, etapa2MainMenu, formatHours } from "@/lib/whatsapp-flow-messages";
import { BRAND_DEFAULT } from "@/lib/whatsapp-catalog";
import { getBusinessHoursStatus, afterHoursMessage } from "@/lib/business-hours";
import { testSessions } from "@/lib/test-sessions-store";

export async function POST(req: NextRequest) {
  try {
    const { sessionId, testHours } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId é obrigatório" },
        { status: 400 }
      );
    }

    // Limpar sessão anterior se existir
    testSessions.delete(sessionId);

    // Criar nova sessão de teste
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    // Se não houver settings, usar padrão
    if (!settings) {
      return NextResponse.json(
        { success: false, error: "Configurações não encontradas. Configure o sistema primeiro." },
        { status: 500 }
      );
    }

    // ⏰ Permitir override do horário para testes
    // testHours pode ser: "08:00", "14:30", etc. — simula que agora é esse horário
    let now = new Date();
    if (testHours && typeof testHours === "string" && /^\d{1,2}:\d{2}$/.test(testHours)) {
      const [h, m] = testHours.split(":").map(Number);
      now = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    }

    const businessHours = getBusinessHoursStatus(settings as any, now);
    if (!businessHours.isOpen) {
      testSessions.set(sessionId, {
        stage: "AFTER_HOURS",
        welcomed: false,
      });

      const msg = afterHoursMessage(
        {
          businessName: settings.businessName || BRAND_DEFAULT,
          businessHoursStart: settings.businessHoursStart,
          businessHoursEnd: settings.businessHoursEnd,
          lunchBreakStart: settings.lunchBreakStart,
          lunchBreakEnd: settings.lunchBreakEnd,
          workingDays: settings.workingDays,
        },
        null,
        businessHours
      );

      return NextResponse.json({
        success: true,
        messages: [
          {
            id: "initial",
            role: "bot",
            content: msg,
          },
        ],
      });
    }

    // Carregar catálogo e prompts
    const wctx = await loadWhatsAppCatalog(true);
    const prompts = await loadPromptMap();

    // Gerar mensagem de boas-vindas
    const welcomeText = etapa1Welcome(
      {
        businessName: settings?.businessName || BRAND_DEFAULT,
        hours: formatHours(
          settings?.businessHoursStart || "08:00",
          settings?.businessHoursEnd || "18:00",
          settings?.workingDays || "1,2,3,4,5,6"
        ),
        address: settings?.businessAddress || "",
        pixKey: settings?.pixKey || null,
        pixHolder: settings?.pixHolderName || null,
        pixBank: settings?.pixBank || null,
      },
      prompts
    );

    // Salvar sessão
    testSessions.set(sessionId, {
      stage: "ETAPA1_AWAITING_NAME",
      welcomed: false,
      customerName: null,
      selectedService: null,
      selectedSubService: null,
      vehicle: {
        model: null,
        year: null,
        color: null,
        condition: "normal",
      },
      quote: null,
      upsellOffer: null,
    });

    return NextResponse.json({
      success: true,
      messages: [
        {
          id: "initial",
          role: "bot",
          content: welcomeText,
        },
      ],
    });
  } catch (error) {
    console.error("[Teste Bot] Erro ao inicializar:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao inicializar teste" },
      { status: 500 }
    );
  }
}
