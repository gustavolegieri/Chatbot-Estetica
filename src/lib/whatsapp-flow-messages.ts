import { BRAND_DEFAULT, CATALOG, type CatalogItem } from "./whatsapp-catalog";
import { getDefaultPromptMap, renderPrompt, type PromptMap } from "./bot-prompts";

export interface FlowContext {
  businessName: string;
  hours: string;
  address: string;
  pixKey: string | null;
  pixHolder: string | null;
  pixBank: string | null;
  pixMerchantCity: string;
  pixQrCodeImage: string | null;
}

function p(prompts: PromptMap | undefined) {
  return prompts ?? getDefaultPromptMap();
}

export function formatHours(start: string, end: string, workingDays: string) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const days = workingDays.split(",").map(Number);
  const range =
    days.length === 6 && !days.includes(0)
      ? "Segunda a sábado"
      : days.map((d) => labels[d]).join(", ");
  return `${range}, ${start} às ${end}`;
}

// ─────────────────────────────────────────────────────────────
// ETAPA 1 — BOAS-VINDAS
// ─────────────────────────────────────────────────────────────

export function etapa1Welcome(ctx: FlowContext, prompts?: PromptMap) {
  const name = ctx.businessName || BRAND_DEFAULT;
  return renderPrompt(p(prompts), "etapa1_welcome", {
    businessName: name,
    address: ctx.address || "Consulte nosso endereço",
    hours: ctx.hours,
  });
}

// ─────────────────────────────────────────────────────────────
// ETAPA 2 — MENU PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function etapa2MainMenu(clientName: string, menu: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa2_main_menu", {
    clientName,
    menu,
  });
}

// ─────────────────────────────────────────────────────────────
// ETAPA 3 — DETALHE DO SERVIÇO
// ─────────────────────────────────────────────────────────────

function formatServicePrice(item: CatalogItem): string {
  if (item.key === "polimento_cotacao" || item.hatchMin <= 0) {
    return "💰 *Valor mediante avaliação presencial* — agende para cotação";
  }
  return `💰 *R$ ${item.hatchMin}*`;
}

export function serviceDetail(item: CatalogItem, prompts?: PromptMap, detailOverride?: string | null) {
  if (detailOverride?.trim()) {
    return [detailOverride.trim(), ``, serviceActionMenu(prompts)].join("\n");
  }

  if (item.key === "pacotes") {
    return [
      `📦 *Pacotes Premium — Garagem do Ka*`,
      ``,
      `Transformação completa em um único atendimento. Combos pensados para entregar o máximo de resultado com o melhor custo-benefício:`,
      ``,
      `✦ *Detail Essencial* — a partir de R$ 550`,
      `   Lavagem detalhada + polimento leve + proteção básica`,
      `   _Perfeito para manter o carro sempre impecável_`,
      ``,
      `✦ *Proteção Total* — a partir de R$ 900`,
      `   Polimento técnico + vitrificação cerâmica de alta performance`,
      `   _Brilho profundo com proteção que dura_`,
      ``,
      `✦ *Interior Premium* — a partir de R$ 380`,
      `   Higienização completa + tratamento de couro + aromatização`,
      `   _Sensação de carro zero km por dentro_`,
      ``,
      `✦ *Full Detail Ka* — a partir de R$ 1.400`,
      `   Exterior + interior + proteção cerâmica premium`,
      `   _O pacote mais completo da Garagem do Ka_`,
      ``,
      `💬 Qual combo combina mais com o que você busca?`,
      ``,
      packageActionMenu(prompts),
    ].join("\n");
  }

  const serviceTexts: Record<string, string[]> = {
    lavagem_simples: [
      `💧 *Lavagem Simples*`,
      ``,
      `_Manutenção regular com cuidado e acabamento que faz diferença._`,
      ``,
      `✨ *O que inclui:*`,
      `• Pré-lavagem com espuma ativa que solta a sujeira`,
      `• Lavagem externa manual, segura para a pintura`,
      `• Secagem completa com microfibra premium`,
      `• Finalização dos pneus com pretinho`,
      `• Aspiração e limpeza interna básica`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    lavagem_completa: [
      `💧 *Lavagem Completa*`,
      ``,
      `_Muito além da lavagem comum — brilho, proteção e interior renovado._`,
      ``,
      `✨ *O que inclui:*`,
      `• Pré-lavagem com espuma ativa + lavagem externa manual`,
      `• Secagem cuidadosa com microfibra`,
      `• Limpeza interna básica com aspiração`,
      `• Pretinho nos pneus e acabamento impecável`,
      `• Revitalização de plásticos externos`,
      `• Aplicação de cera líquida para brilho intenso`,
      `• Limpeza e cristalização dos vidros`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    lavagem_detalhada: [
      `💧 *Lavagem Detalhada*`,
      ``,
      `_Cada centímetro tratado com atenção — resultado de estúdio._`,
      ``,
      `✨ *O que inclui:*`,
      `• Pré-lavagem com espuma + lavagem externa completa`,
      `• Secagem total com microfibra em toda a lataria`,
      `• Limpeza interna detalhada (painel, console e detalhes)`,
      `• Ducha nos vãos de portas, mala e soleiras`,
      `• Limpeza profunda de pedais e trilhos dos bancos`,
      `• Cera em pasta para brilho profundo e proteção`,
      `• Pretinho, revitalização de plásticos e caixas de roda`,
      `• Vidros cristalinos, tapetes, saquinho de lixo e aromatização`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    limpeza_motor: [
      `🔬 *Lavagem Técnica do Motor*`,
      ``,
      `_Compartimento limpo, seguro e com visual de vitrine — sem riscos._`,
      ``,
      `✨ *O que inclui:*`,
      `• Proteção de módulos e componentes elétricos`,
      `• Desengorduramento técnico com produtos específicos`,
      `• Lavagem controlada do bloco e bacias`,
      `• Acabamento e secagem segura do compartimento`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    cristalizacao_farois: [
      `🛡️ *Cristalização de Faróis*`,
      ``,
      `_Faróis opacos voltam a brilhar — mais segurança e estética na direção noturna._`,
      ``,
      `✨ *O que inclui:*`,
      `• Lixamento e polimento para remover amarelamento`,
      `• Recuperação da transparência original`,
      `• Cristalização com selante UV de longa duração`,
      `• Proteção contra reoxidação e ressecamento`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    descontaminacao_pintura: [
      `🛡️ *Descontaminação + Cera Nobre*`,
      ``,
      `_Remove impurezas da pintura e sela com brilho premium e proteção._`,
      ``,
      `✨ *O que inclui:*`,
      `• Lavagem técnica de preparo da lataria`,
      `• Clay bar para eliminar contaminantes metálicos`,
      `• Remoção de resíduos industriais e poluição`,
      `• Aplicação de cera nobre com acabamento espelhado`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_tecido: [
      `🪑 *Higienização Bancos (Tecido)*`,
      ``,
      `_Bancos renovados — sem odores, manchas impregnadas ou ácaros._`,
      ``,
      `✨ *O que inclui:*`,
      `• Aspiração profunda dos estofados`,
      `• Extração com shampoo automotivo de alta performance`,
      `• Tratamento de manchas e odores impregnados`,
      `• Secagem e acabamento com toque macio`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_tecido_completa: [
      `🪑 *Higienização Completa (Tecido)*`,
      ``,
      `_Interior zerado — bancos, teto e carpete como novos._`,
      ``,
      `✨ *O que inclui:*`,
      `• Higienização profunda de todos os bancos`,
      `• Limpeza e extração do teto em tecido`,
      `• Tratamento completo do carpete e tapetes`,
      `• Eliminação de odores e acabamento aromatizado`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_couro: [
      `🪑 *Higienização Bancos (Couro)*`,
      ``,
      `_Couro limpo, hidratado e protegido — maciez e aparência premium._`,
      ``,
      `✨ *O que inclui:*`,
      `• Limpeza profunda com produtos específicos para couro`,
      `• Remoção de oleosidade, sujeira e manchas superficiais`,
      `• Hidratação para evitar ressecamento e rachaduras`,
      `• Proteção que preserva cor e textura original`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_couro_completa: [
      `🪑 *Higienização Completa (Couro)*`,
      ``,
      `_Todo o interior em couro tratado com padrão de luxo._`,
      ``,
      `✨ *O que inclui:*`,
      `• Higienização e hidratação de todos os bancos`,
      `• Limpeza e tratamento do forro do teto`,
      `• Cuidado completo com carpetes e detalhes internos`,
      `• Acabamento premium com proteção duradoura`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    descontaminacao_vidro: [
      `🔬 *Descontaminação de Vidro*`,
      ``,
      `_Vidros cristalinos, sem manchas — visibilidade perfeita em qualquer clima._`,
      ``,
      `✨ *O que inclui:*`,
      `• Remoção de resíduos de chuva ácida e poluição`,
      `• Descontaminação interna e externa dos vidros`,
      `• Eliminação de marcas de água e oleosidade`,
      `• Acabamento antirreflexo e alta clareza`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    polimento_cotacao: [
      `✨ *Polimento*`,
      ``,
      `_Correção de riscos, swirls e opacidade — pintura com brilho de showroom._`,
      ``,
      `✨ *O que inclui:*`,
      `• Avaliação presencial da profundidade dos riscos`,
      `• Polimento técnico com compostos profissionais`,
      `• Correção de hologramas, marcas e perda de brilho`,
      `• Lustro final e proteção conforme estado da pintura`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    revitalizacao_pintura: [
      `🔄 *Revitalização de Pintura*`,
      ``,
      `_Para pinturas opacas e sem vida — cor e brilho originais de volta._`,
      ``,
      `✨ *O que inclui:*`,
      `• Diagnóstico completo do estado da lataria`,
      `• Descontaminação e preparo profissional`,
      `• Polimento técnico para restaurar cor e brilho`,
      `• Proteção final personalizada ao resultado`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    descontaminacao: [
      `🔬 *Descontaminação de Pintura*`,
      ``,
      `_Base perfeita antes de polir ou proteger — pintura lisa como vidro._`,
      ``,
      `✨ *O que inclui:*`,
      `• Lavagem técnica de preparo`,
      `• Clay bar e produtos químicos específicos`,
      `• Remoção de ferro, resina e poluentes industriais`,
      `• Superfície pronta para o próximo tratamento`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
    limpeza_premium: [
      `✨ *Limpeza Premium*`,
      ``,
      `_Detalhamento externo completo — acabamento impecável em cada friso._`,
      ``,
      `✨ *O que inclui:*`,
      `• Lavagem técnica com produtos premium`,
      `• Limpeza de rodas, pneus, soleiras e frisos`,
      `• Aplicação de finalizadores e protegentes`,
      `• Secagem e acabamento de vitrine`,
      ``,
      `⏱️ ${item.time}`,
      formatServicePrice(item),
    ],
  };

  const lines = serviceTexts[item.key] ?? [
    `🔧 *${item.label}*`,
    ``,
    item.short,
    ``,
    item.pitch ? `_${item.pitch}_` : ``,
    ``,
    `⏱️ ${item.time}`,
    formatServicePrice(item),
  ];

  return [...lines.filter((l) => l !== undefined), ``, serviceActionMenu(prompts)].join("\n");
}

export function serviceActionMenu(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "service_action_menu", {});
}

export function packageActionMenu(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "package_action_menu", {});
}

// ─────────────────────────────────────────────────────────────
// ETAPA 4 — VEÍCULO
// ─────────────────────────────────────────────────────────────

export function etapa4Vehicle(hasVehicle: boolean, prompts?: PromptMap) {
  if (hasVehicle) {
    return renderPrompt(p(prompts), "etapa4_vehicle_has", {});
  }
  return renderPrompt(p(prompts), "etapa4_vehicle", {});
}

export function etapa4AskYear(model: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa4_ask_year", { model });
}

export function vehicleModelNotUnderstood(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "vehicle_model_not_understood", {});
}

export function vehicleYearNotUnderstood(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "vehicle_year_not_understood", {});
}

export function vehicleNotUnderstood(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "vehicle_not_understood", {});
}

// ─────────────────────────────────────────────────────────────
// ETAPA 5 — ORÇAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa5Quote(
  name: string,
  vehicle: string,
  service: string,
  min: number,
  max: number,
  time: string,
  pitch?: string,
  prompts?: PromptMap
) {
  const hasValue = min > 0 && max > 0;
  const valueLine = hasValue
    ? `💰 *R$ ${min} a R$ ${max}*`
    : `💰 *Valor sob consulta — confirmado na avaliação*`;

  return renderPrompt(p(prompts), "etapa5_quote", {
    name,
    vehicle,
    service,
    valueLine,
    time,
    pitch: pitch ? `✨ ${pitch}` : "",
  });
}

// ─────────────────────────────────────────────────────────────
// ETAPA 6 — UPSELL
// ─────────────────────────────────────────────────────────────

export function etapa6Upsell(service: string, complement: string, benefit: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa6_upsell", { service, complement, benefit });
}

import { generateCalendarLegend } from "./calendar-helper";

// ─────────────────────────────────────────────────────────────
// ETAPA 7 — AGENDAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa7Day(prompts?: PromptMap) {
  return [generateCalendarLegend(), "", renderPrompt(p(prompts), "etapa7_day", {})].join("\n");
}

export function etapa7Time(dayLabel: string, slots: string[], durationLabel: string, prompts?: PromptMap) {
  if (slots.length === 0) {
    return etapa7NoSlots(dayLabel, prompts);
  }
  const slotLines = slots.slice(0, 14).map((s, i) => `*${i + 1}* — ${s}`).join("\n");
  return renderPrompt(p(prompts), "etapa7_time", {
    dayLabel,
    slots: slotLines,
    durationLabel,
  });
}

export function etapa7NoSlots(dayLabel: string, prompts?: PromptMap) {
  const base = renderPrompt(p(prompts), "etapa7_no_slots", { dayLabel });
  return [base, ``, etapa7Day(prompts)].join("\n");
}

// ─────────────────────────────────────────────────────────────
// ETAPA 8 — PAGAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa8Payment(hasPix: boolean, prompts?: PromptMap) {
  const options = hasPix
    ? [`*1* PIX`, `*2* Débito`, `*3* Crédito`, `*4* Dinheiro`]
    : [`*1* Débito`, `*2* Crédito`, `*3* Dinheiro`];

  return renderPrompt(p(prompts), "etapa8_payment", {
    options: options.join("\n"),
  });
}

export function etapa8PixBlock(ctx: FlowContext, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_pix_block", {
    pixKey: ctx.pixKey ?? "",
    pixHolder: ctx.pixHolder ?? ctx.businessName,
    bankLine: ctx.pixBank ? `🏦 *Banco:* ${ctx.pixBank}` : "",
    businessName: ctx.businessName,
  });
}

export function etapa8PixChoice(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_pix_choice", {});
}

export function etapa8ReceiptUpload(value: number, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_receipt_upload", {
    value: `R$ ${value.toFixed(2).replace(".", ",")}`,
  });
}

export function etapa8ReceiptInvalid(expected: number, received: number, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_receipt_invalid", {
    expected: `R$ ${expected.toFixed(2).replace(".", ",")}`,
    received: `R$ ${received.toFixed(2).replace(".", ",")}`,
  });
}

export function etapa8ReceiptError(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_receipt_error", {});
}

// ─────────────────────────────────────────────────────────────
// ETAPA 9 — CONFIRMAÇÃO FINAL DO AGENDAMENTO
// ─────────────────────────────────────────────────────────────

export function etapa9Confirm(
  data: {
    name: string;
    vehicle: string;
    services: string;
    day: string;
    time: string;
    payment: string;
    value: string;
    address: string;
    pixBlock?: string;
  },
  prompts?: PromptMap
) {
  return renderPrompt(p(prompts), "etapa9_confirm", {
    name: data.name,
    vehicle: data.vehicle,
    services: data.services,
    day: data.day,
    time: data.time,
    payment: data.payment,
    value: data.value,
    address: data.address,
    pixBlock: data.pixBlock ? `\n${data.pixBlock}` : "",
  });
}

// ─────────────────────────────────────────────────────────────
// STALE RETURN — RETORNO APÓS INATIVIDADE
// ─────────────────────────────────────────────────────────────

export function staleReturnPrompt(
  flow?: {
    customerName?: string;
    vehicleRaw?: string;
    serviceLabel?: string;
    stage?: string;
  },
  prompts?: PromptMap
) {
  const name = flow?.customerName ? `, *${flow.customerName}*` : ``;
  const hasContext = flow?.vehicleRaw || flow?.serviceLabel;

  const contextLine =
    flow?.serviceLabel && flow?.vehicleRaw
      ? `Você estava vendo *${flow.serviceLabel}* para o seu *${flow.vehicleRaw}* 🚗`
      : flow?.serviceLabel
        ? `Você estava vendo *${flow.serviceLabel}* 🔧`
        : flow?.vehicleRaw
          ? `Você estava com seu *${flow.vehicleRaw}* em mãos 🚗`
          : `Você estava no meio de um agendamento.`;

  return renderPrompt(p(prompts), "stale_return", {
    name,
    contextLine,
    continueLine: hasContext ? `Bora continuar de onde paramos?` : `Posso te ajudar com alguma coisa?`,
  });
}

// ─────────────────────────────────────────────────────────────
// CLIENTE INDECISO
// ─────────────────────────────────────────────────────────────

export function indecisiveVehiclePrompt(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "indecisive_vehicle", {});
}

export function indecisiveProblemPrompt(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "indecisive_problem", {});
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────

export function invalidMenu(menu: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "invalid_menu", { menu });
}

export function quotePitchForService(key: string, catalog: Record<string, CatalogItem> = CATALOG): string {
  const item = catalog[key];
  if (!item) return "";
  return item.pitch ?? "";
}
