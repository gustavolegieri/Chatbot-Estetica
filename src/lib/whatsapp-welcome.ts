import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { sendText } from "./evolution-api";
import { loadWhatsAppCatalog, buildMainMenu } from "./whatsapp-service-catalog";
import { etapa1Welcome, etapa2MainMenu, formatHours } from "./whatsapp-flow-messages";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import { resolveValidCustomerName } from "./customer-name";

async function loadWelcomeContext() {
  const s = await prisma.settings.findUnique({ where: { id: "default" } });
  return {
    businessName: s?.businessName ?? BRAND_DEFAULT,
    hours: formatHours(
      s?.businessHoursStart ?? "08:00",
      s?.businessHoursEnd ?? "18:00",
      s?.workingDays ?? "1,2,3,4,5,6"
    ),
    address: s?.businessAddress ?? "",
    pixKey: s?.pixKey ?? null,
    pixHolder: s?.pixHolderName ?? null,
    pixBank: s?.pixBank ?? null,
    pixMerchantCity: s?.pixMerchantCity ?? "Jundiai",
    pixQrCodeImage: s?.pixQrCodeImage ?? null,
  };
}

/** Envia boas-vindas completas e posiciona o fluxo no início */
export async function sendWelcomeFlow(phone: string, rawName?: string | null) {
  const normalized = normalizePhone(phone);
  const wctx = await loadWhatsAppCatalog(true);
  const ctx = await loadWelcomeContext();
  const validName = resolveValidCustomerName(rawName);

  // Sempre reinicia do zero após 30 minutos de inatividade
  await sendText({
    number: normalized,
    text: etapa1Welcome(ctx, wctx.prompts),
    flowStage: "ETAPA1_AWAITING_NAME",
  });
  
  await prisma.whatsAppSession.update({
    where: { phone: normalized },
    data: {
      metadata: { stage: "ETAPA1_AWAITING_NAME", welcomed: true } as object,
      step: WhatsAppSessionStep.IDLE,
    },
  });
}
