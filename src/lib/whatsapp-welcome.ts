import { WhatsAppSessionStep } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./utils";
import { sendMedia, sendText } from "./evolution-api";
import { generateWelcomeCard } from "./whatsapp-cards";
import { loadWhatsAppCatalog, buildMainMenu } from "./whatsapp-service-catalog";
import { etapa1Welcome, etapa2MainMenu, formatHours } from "./whatsapp-flow-messages";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import { resolveValidCustomerName } from "./customer-name";
import { getRuntimeSettings } from "./settings-runtime";

async function loadWelcomeContext() {
  const s = await getRuntimeSettings();
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

/**
 * Abertura da conversa: cartão da marca com o texto na legenda.
 *
 * O endereço, o horário e a lista do que fazemos saem do texto e entram na
 * imagem — a primeira mensagem deixa de ser um parágrafo de oito linhas e passa
 * a ser um cartão com uma pergunta embaixo. Se a imagem falhar (Cloudinary
 * fora, por exemplo), o mesmo texto vai sozinho e o atendimento segue igual.
 */
export async function sendWelcomeCover(
  phone: string,
  caption: string,
  flowStage: string
): Promise<void> {
  const ctx = await loadWelcomeContext();
  const wctx = await loadWhatsAppCatalog();
  const destaques = Object.values(wctx.categories)
    .filter((categoria) => categoria.keys.length > 0)
    .map((categoria) => categoria.title)
    .slice(0, 4);

  const url = await generateWelcomeCard({
    businessName: ctx.businessName,
    tagline: "Estética automotiva de detalhe",
    destaques: destaques.length ? destaques : ["Lavagem", "Polimento", "Proteção", "Higienização"],
    address: ctx.address || "Jundiaí/SP",
    hours: ctx.hours,
  });

  if (url) {
    const entrega = await sendMedia({ number: phone, mediaUrl: url, caption });
    const falhou =
      (entrega as { error?: unknown })?.error || (entrega as { blocked?: unknown })?.blocked;
    if (!falhou) return;
  }

  await sendText({ number: phone, text: caption, flowStage });
}

/** Envia boas-vindas completas e posiciona o fluxo no início */
export async function sendWelcomeFlow(phone: string, rawName?: string | null) {
  const normalized = normalizePhone(phone);
  const wctx = await loadWhatsAppCatalog(true);
  const ctx = await loadWelcomeContext();
  const validName = resolveValidCustomerName(rawName);
  const nextStage = validName ? "ETAPA2_MAIN_MENU" : "ETAPA1_AWAITING_NAME";

  // Cliente conhecido não precisa da capa de novo: vai direto ao menu, que já é
  // uma lista tocável. Quem chega sem nome recebe o cartão da marca.
  if (validName) {
    await sendText({
      number: normalized,
      text: `Olá de novo, *${validName}*! 🚗`,
      flowStage: nextStage,
    });
    await sendText({
      number: normalized,
      text: etapa2MainMenu(
        validName,
        buildMainMenu(wctx.categories, wctx.prompts, wctx.catalog),
        wctx.prompts
      ),
      flowStage: nextStage,
    });
  } else {
    await sendWelcomeCover(normalized, etapa1Welcome(ctx, wctx.prompts), nextStage);
  }


  await prisma.whatsAppSession.update({
    where: { phone: normalized },
    data: {
      metadata: {
        stage: nextStage,
        welcomed: true,
        customerName: validName ?? undefined,
      } as object,
      lastStage: nextStage,
      step: WhatsAppSessionStep.IDLE,
    },
  });
}
