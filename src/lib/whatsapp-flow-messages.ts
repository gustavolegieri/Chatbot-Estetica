import { BRAND_DEFAULT, CATALOG, type CatalogItem } from "./whatsapp-catalog";
import { getDefaultPromptMap, renderPrompt, type PromptMap } from "./bot-prompts";

export interface FlowContext {
  businessName: string;
  hours: string;
  address: string;
  pixKey: string | null;
  pixHolder: string | null;
  pixBank: string | null;
}

function p(prompts: PromptMap | undefined) {
  return prompts ?? getDefaultPromptMap();
}

export function formatHours(start: string, end: string, workingDays: string) {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "SÃ¡b"];
  const days = workingDays.split(",").map(Number);
  const range =
    days.length === 6 && !days.includes(0)
      ? "Segunda a sÃ¡bado"
      : days.map((d) => labels[d]).join(", ");
  return `${range}, ${start} Ã s ${end}`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 1 â€” BOAS-VINDAS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function etapa1Welcome(ctx: FlowContext, prompts?: PromptMap) {
  const name = ctx.businessName || BRAND_DEFAULT;
  return renderPrompt(p(prompts), "etapa1_welcome", {
    businessName: name,
    address: ctx.address || "Consulte nosso endereÃ§o",
    hours: ctx.hours,
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 2 â€” MENU PRINCIPAL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function etapa2MainMenu(clientName: string, menu: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa2_main_menu", {
    clientName,
    menu,
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 3 â€” DETALHE DO SERVIÃ‡O
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatServicePrice(item: CatalogItem): string {
  if (item.key === "polimento_cotacao" || item.hatchMin <= 0) {
    return "ðŸ’° *Valor mediante avaliaÃ§Ã£o presencial* â€” agende para cotaÃ§Ã£o";
  }
  return `ðŸ’° *R$ ${item.hatchMin}*`;
}

export function serviceDetail(item: CatalogItem, prompts?: PromptMap, detailOverride?: string | null) {
  if (detailOverride?.trim()) {
    return [detailOverride.trim(), ``, serviceActionMenu(prompts)].join("\n");
  }

  const serviceTexts: Record<string, string[]> = {
    lavagem_simples: [
      `ðŸ’§ *Lavagem Simples*`,
      ``,
      `O que inclui:`,
      `â€¢ Ducha`,
      `â€¢ Secagem`,
      `â€¢ AplicaÃ§Ã£o de pretinho`,
      `â€¢ Limpeza interna bÃ¡sica`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    lavagem_completa: [
      `ðŸ’§ *Lavagem Completa*`,
      ``,
      `O que inclui:`,
      `â€¢ Ducha e secagem`,
      `â€¢ Limpeza interna bÃ¡sica`,
      `â€¢ AplicaÃ§Ã£o de pretinho`,
      `â€¢ RevitalizaÃ§Ã£o de plÃ¡sticos`,
      `â€¢ AplicaÃ§Ã£o de cera lÃ­quida`,
      `â€¢ Limpeza dos vidros`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    lavagem_detalhada: [
      `ðŸ’§ *Lavagem Detalhada*`,
      ``,
      `O que inclui:`,
      `â€¢ Ducha e secagem`,
      `â€¢ Limpeza interna detalhada`,
      `â€¢ Ducha nos cantos de portas/mala`,
      `â€¢ Limpeza de pedais e trilhos`,
      `â€¢ Cera em pasta, pretinho e plÃ¡sticos`,
      `â€¢ Caixas de roda, vidros, tapetes e cheirinho`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    limpeza_motor: [
      `ðŸ”§ *Lavagem TÃ©cnica do Motor*`,
      ``,
      `Limpeza tÃ©cnica e segura do compartimento do motor.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    cristalizacao_farois: [
      `ðŸ’¡ *CristalizaÃ§Ã£o de FarÃ³is*`,
      ``,
      `Recupera transparÃªncia e aparÃªncia dos farÃ³is.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    descontaminacao_pintura: [
      `âœ¨ *DescontaminaÃ§Ã£o + Cera Nobre*`,
      ``,
      `Remove contaminantes da pintura e aplica cera nobre.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_tecido: [
      `ðŸª‘ *HigienizaÃ§Ã£o Bancos (Tecido)*`,
      ``,
      `HigienizaÃ§Ã£o profunda dos bancos de tecido.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_tecido_completa: [
      `ðŸª‘ *HigienizaÃ§Ã£o Completa (Tecido)*`,
      ``,
      `Bancos, teto e carpete em tecido.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_couro: [
      `ðŸª‘ *HigienizaÃ§Ã£o Bancos (Couro)*`,
      ``,
      `Limpeza e tratamento dos bancos de couro.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    higienizacao_couro_completa: [
      `ðŸª‘ *HigienizaÃ§Ã£o Completa (Couro)*`,
      ``,
      `Bancos, teto e carpete em couro.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    descontaminacao_vidro: [
      `ðŸªŸ *DescontaminaÃ§Ã£o de Vidro*`,
      ``,
      `Remove resÃ­duos e melhora a clareza dos vidros.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
    polimento_cotacao: [
      `âœ¨ *Polimento*`,
      ``,
      `CorreÃ§Ã£o de riscos e brilho profundo â€” valor personalizado conforme estado da pintura.`,
      ``,
      `â±ï¸ ${item.time}`,
      formatServicePrice(item),
    ],
  };

  const lines = serviceTexts[item.key] ?? [
    `ðŸ”§ *${item.label}*`,
    ``,
    item.short,
    ``,
    item.pitch ? `_${item.pitch}_` : ``,
    ``,
    `â±ï¸ ${item.time}`,
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 4 â€” VEÃCULO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 5 â€” ORÃ‡AMENTO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    ? `ðŸ’° *R$ ${min} a R$ ${max}*`
    : `ðŸ’° *Valor sob consulta â€” confirmado na avaliaÃ§Ã£o*`;

  return renderPrompt(p(prompts), "etapa5_quote", {
    name,
    vehicle,
    service,
    valueLine,
    time,
    pitch: pitch ? `âœ¨ ${pitch}` : "",
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 6 â€” UPSELL
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function etapa6Upsell(service: string, complement: string, benefit: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa6_upsell", { service, complement, benefit });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 7 â€” AGENDAMENTO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function etapa7Day(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa7_day", {});
}

export function etapa7Time(dayLabel: string, slots: string[], durationLabel: string, prompts?: PromptMap) {
  if (slots.length === 0) {
    return etapa7NoSlots(dayLabel, prompts);
  }
  const slotLines = slots.slice(0, 14).map((s, i) => `*${i + 1}* â€” ${s}`).join("\n");
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 8 â€” PAGAMENTO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function etapa8Payment(hasPix: boolean, prompts?: PromptMap) {
  const options = hasPix
    ? [`*1* PIX`, `*2* DÃ©bito`, `*3* CrÃ©dito`, `*4* Dinheiro`]
    : [`*1* DÃ©bito`, `*2* CrÃ©dito`, `*3* Dinheiro`];

  return renderPrompt(p(prompts), "etapa8_payment", {
    options: options.join("\n"),
  });
}

export function etapa8PixBlock(ctx: FlowContext, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "etapa8_pix_block", {
    pixKey: ctx.pixKey ?? "",
    pixHolder: ctx.pixHolder ?? ctx.businessName,
    bankLine: ctx.pixBank ? `ðŸ¦ *Banco:* ${ctx.pixBank}` : "",
    businessName: ctx.businessName,
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ETAPA 9 â€” CONFIRMAÃ‡ÃƒO FINAL DO AGENDAMENTO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STALE RETURN â€” RETORNO APÃ“S INATIVIDADE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      ? `VocÃª estava vendo *${flow.serviceLabel}* para o seu *${flow.vehicleRaw}* ðŸš—`
      : flow?.serviceLabel
        ? `VocÃª estava vendo *${flow.serviceLabel}* ðŸ”§`
        : flow?.vehicleRaw
          ? `VocÃª estava com seu *${flow.vehicleRaw}* em mÃ£os ðŸš—`
          : `VocÃª estava no meio de um agendamento.`;

  return renderPrompt(p(prompts), "stale_return", {
    name,
    contextLine,
    continueLine: hasContext ? `Bora continuar de onde paramos?` : `Posso te ajudar com alguma coisa?`,
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CLIENTE INDECISO
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function indecisiveVehiclePrompt(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "indecisive_vehicle", {});
}

export function indecisiveProblemPrompt(prompts?: PromptMap) {
  return renderPrompt(p(prompts), "indecisive_problem", {});
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// UTILITÃRIOS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function invalidMenu(menu: string, prompts?: PromptMap) {
  return renderPrompt(p(prompts), "invalid_menu", { menu });
}

export function quotePitchForService(key: string, catalog: Record<string, CatalogItem> = CATALOG): string {
  const item = catalog[key];
  if (!item) return "";
  return item.pitch ?? "";
}
