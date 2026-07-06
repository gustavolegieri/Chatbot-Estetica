import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadWhatsAppCatalog, buildMainMenu } from "@/lib/whatsapp-service-catalog";
import { loadPromptMap } from "@/lib/bot-prompts";
import { etapa1Welcome, etapa2MainMenu, formatHours } from "@/lib/whatsapp-flow-messages";
import { BRAND_DEFAULT } from "@/lib/whatsapp-catalog";
import { getBusinessHoursStatus } from "@/lib/business-hours";
import { testSessions } from "@/lib/test-sessions-store";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

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

    const businessHours = getBusinessHoursStatus(settings as any);
    if (!businessHours.isOpen) {
      testSessions.set(sessionId, {
        stage: "AFTER_HOURS",
        welcomed: false,
      });

      return NextResponse.json({
        success: true,
        messages: [
          {
            id: "initial",
            role: "bot",
            content:
              "🕐 Desculpe, estamos fora do horário de atendimento! Envie sua mensagem e responderemos assim que possível.",
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
