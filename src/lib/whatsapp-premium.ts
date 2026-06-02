/** Atendimento premium — textos, catálogo e helpers de sessão */

export const SESSION_RESET_MS = 45 * 60 * 1000;
export const RECOVERY_IDLE_MS = 10 * 60 * 1000;

export interface SessionMetadata {
  flow?: "consult" | "booking" | "price";
  catalogId?: number;
  vehicleModel?: string;
  vehicleYear?: string;
  paintCondition?: string;
  customerName?: string;
  recoverySent?: boolean;
  consultStep?: "model" | "year" | "condition";
  bookingStep?: "name" | "vehicle" | "service" | "day" | "time";
}

export interface CatalogItem {
  id: number;
  name: string;
  dbMatch: string;
  pitch: string;
  benefits: string;
  upsell?: { service: string; text: string };
  fallbackPrice?: number;
}

export const SERVICE_CATALOG: CatalogItem[] = [
  {
    id: 1,
    name: "Lavagem detalhada",
    dbMatch: "Lavagem",
    pitch: "Nossa lavagem detalhada vai além da lavagem comum ✨",
    benefits:
      "Limpeza profunda externa e interna, acabamento impecável e proteção básica da pintura — seu carro sai com cara de zero km 🚗",
    upsell: {
      service: "Higienização interna",
      text: "Muitos clientes aproveitam para fazer *higienização interna* no mesmo dia — o carro fica perfeito por dentro e por fora 😊",
    },
  },
  {
    id: 2,
    name: "Polimento técnico",
    dbMatch: "Polimento",
    pitch: "Excelente escolha 🔥",
    benefits:
      "Remove micro riscos, devolve brilho profundo e revitaliza totalmente a pintura do veículo ✨",
    upsell: {
      service: "Vitrificação",
      text: "Já que vai realizar o polimento, muitos clientes aproveitam para fazer *vitrificação* também ✨\nA proteção da pintura dura muito mais e o brilho fica absurdo 🔥",
    },
  },
  {
    id: 3,
    name: "Vitrificação",
    dbMatch: "Vitrificação",
    pitch: "Escolha premium de verdade ✨",
    benefits:
      "Proteção cerâmica de alta performance, brilho intenso e pintura protegida por muito mais tempo 🔥",
    upsell: {
      service: "Polimento técnico",
      text: "Para o brilho ficar perfeito antes da vitrificação, recomendamos o *polimento técnico* — posso incluir no pacote 😊",
    },
  },
  {
    id: 4,
    name: "Higienização interna",
    dbMatch: "Higienização",
    pitch: "Ótima escolha para conforto e valorização 😊",
    benefits:
      "Limpeza profunda de estofados, carpetes e detalhes internos — elimina odores e deixa o habitáculo como novo ✨",
    upsell: {
      service: "Lavagem detalhada",
      text: "A *higienização interna* combina muito com lavagem detalhada externa — muitos clientes fazem os dois no mesmo dia 🚗",
    },
  },
  {
    id: 5,
    name: "Cristalização",
    dbMatch: "Cristalização",
    pitch: "Proteção e brilho em alto nível ✨",
    benefits:
      "Selagem que realça o brilho e protege a pintura contra agentes externos — ideal para quem quer resultado premium com ótimo custo-benefício 🔥",
    fallbackPrice: 449.9,
    upsell: {
      service: "Vitrificação",
      text: "Se quiser proteção ainda mais duradoura, a *vitrificação* é o próximo passo — posso te explicar as diferenças 😊",
    },
  },
  {
    id: 6,
    name: "Enceramento premium",
    dbMatch: "Enceramento",
    pitch: "Brilho clássico com acabamento de vitrine ✨",
    benefits:
      "Cera de alta qualidade, profundidade no brilho e proteção temporária — perfeito para eventos ou manutenção entre serviços maiores 🚗",
    fallbackPrice: 179.9,
  },
  {
    id: 7,
    name: "Revitalização de plásticos",
    dbMatch: "Revitalização",
    pitch: "Detalhe que faz toda diferença no visual 🔥",
    benefits:
      "Recupera plásticos externos e internos opacos, deixando acabamento uniforme e aspecto de carro cuidado ✨",
    fallbackPrice: 149.9,
  },
  {
    id: 8,
    name: "Limpeza de motor",
    dbMatch: "Limpeza de motor",
    pitch: "Cuidado técnico que valoriza e protege 🚗",
    benefits:
      "Limpeza segura do compartimento do motor, removendo resíduos e deixando apresentação impecável para venda ou manutenção premium ✨",
    fallbackPrice: 199.9,
  },
];

export function parseMetadata(raw: unknown): SessionMetadata {
  if (!raw || typeof raw !== "object") return {};
  return raw as SessionMetadata;
}

/** Saudação curta (oi, bom dia…) — sempre recebe boas-vindas completas */
export function isSimpleGreeting(text: string) {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (!t) return false;
  return (
    /^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|tudo bem|td bem)( oi)?$/.test(t) ||
    /^o+i+$/.test(t.replace(/\s/g, ""))
  );
}

/** Detecta serviço mencionado no texto livre */
export function detectServiceFromText(text: string): number | null {
  const t = text.toLowerCase();
  const rules: Array<{ id: number; words: string[] }> = [
    { id: 1, words: ["lavagem", "lavar", "higienizacao externa"] },
    { id: 2, words: ["polimento", "polir", "risco", "riscos"] },
    { id: 3, words: ["vitrificacao", "ceramica", "cerâmica", "coating"] },
    { id: 4, words: ["higienizacao", "higienização", "interna", "estofado"] },
    { id: 5, words: ["cristalizacao", "cristalização"] },
    { id: 6, words: ["enceramento", "cera"] },
    { id: 7, words: ["plastico", "plástico", "revitalizacao"] },
    { id: 8, words: ["motor", "limpeza de motor"] },
  ];
  for (const rule of rules) {
    if (rule.words.some((w) => t.includes(w))) return rule.id;
  }
  return null;
}

/** Parece descrição de veículo (modelo, ano, etc.) */
export function looksLikeVehicleMessage(text: string) {
  const t = text.toLowerCase();
  return (
    /\b(19|20)\d{2}\b/.test(t) ||
    /\b(civic|corolla|hb20|onix|gol|polo|jeep|suv|hilux|toro|creta|kicks|argo|uno|palio)\b/i.test(
      text
    ) ||
    /\b(modelo|veiculo|veículo|carro|moto)\b/.test(t)
  );
}

export function generalAcknowledgment(userText: string) {
  const snippet = userText.trim().slice(0, 80);
  return `Entendi 😊 Sobre *"${snippet}"* — vou te ajudar com o melhor cuidado para seu veículo 🚗✨`;
}

export function wantsPrice(text: string) {
  const t = text.toLowerCase();
  return /preço|preco|valor|valores|quanto|custa|orçamento|orcamento/.test(t);
}

export function wantsBooking(text: string) {
  const t = text.toLowerCase();
  return /agendar|agendamento|marcar|horário|horario|reservar/.test(t);
}

export function wantsHelpChoosing(text: string) {
  const t = text.toLowerCase();
  return /não sei|nao sei|indeciso|qual (serviço|servico)|me ajuda|recomenda|indica/.test(t);
}

/** Número isolado 1–8 (evita confundir ano do carro, etc.) */
export function catalogFromInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (n >= 1 && n <= 8) return n;
  return null;
}

export function getCatalogItem(id: number) {
  return SERVICE_CATALOG.find((s) => s.id === id);
}

export function premiumWelcome(businessName: string) {
  return [
    `Olá 😊🚗`,
    `Seja muito bem-vindo(a) à *${businessName}*!`,
    ``,
    `Somos especialistas em estética automotiva premium ✨`,
    ``,
    `Trabalhamos com:`,
    `1️⃣ Lavagem detalhada`,
    `2️⃣ Polimento técnico`,
    `3️⃣ Vitrificação`,
    `4️⃣ Higienização interna`,
    `5️⃣ Cristalização`,
    `6️⃣ Enceramento premium`,
    `7️⃣ Revitalização de plásticos`,
    `8️⃣ Limpeza de motor`,
    ``,
    `Me fala qual serviço deseja (número) ou envie o *modelo do veículo* que eu te ajudo melhor 😊`,
    ``,
    `Também pode digitar *agendar*, *valores* ou *meus agendamentos*.`,
  ].join("\n");
}

export function serviceDetailMessage(item: CatalogItem) {
  return [
    item.pitch,
    ``,
    `*${item.name}*`,
    item.benefits,
    ``,
    `Para eu passar valor certinho:`,
    `• qual o *modelo* do carro?`,
    `• qual o *ano*?`,
    `• a pintura está *muito riscada*?`,
  ].join("\n");
}

export function upsellBlock(item: CatalogItem) {
  if (!item.upsell) return "";
  return `\n\n${item.upsell.text}`;
}

export function indecisiveHelp() {
  return [
    `Claro, te ajudo com prazer 😊`,
    ``,
    `Se o objetivo for *brilho e proteção*, recomendo *vitrificação* ✨`,
    ``,
    `Se quiser *renovar a aparência da pintura*, o ideal é *polimento técnico* 🔥`,
    ``,
    `Para manutenção e visual impecável no dia a dia, a *lavagem detalhada* é perfeita 🚗`,
    ``,
    `Me conta o modelo do carro e o que você quer melhorar que eu indico o melhor caminho ✨`,
  ].join("\n");
}

export function recoveryMessage() {
  return `Conseguiu ver as informações? 😊\nSe quiser posso te ajudar a encontrar o melhor serviço para seu veículo 🚗✨`;
}

export function postBookingMessage() {
  return `Perfeito 😊🚗\nSeu atendimento foi registrado com sucesso.\n\nQualquer dúvida estou à disposição ✨`;
}

export function preBookingSummary(data: {
  vehicle: string;
  service: string;
  day: string;
  time: string;
}) {
  return [
    `Perfeito ✅`,
    `Seu pré-agendamento ficou assim:`,
    ``,
    `🚗 Veículo: ${data.vehicle}`,
    `🛠 Serviço: ${data.service}`,
    `📅 Dia: ${data.day}`,
    `⏰ Horário: ${data.time}`,
    ``,
    `Estamos finalizando 😊`,
    ``,
    `Responda *1* para confirmar ou *2* para ajustar.`,
  ].join("\n");
}

export function priceEstimateMessage(serviceName: string, price: string) {
  return `Para o seu veículo, *${serviceName}* fica em média *${price}* 😊\n\nPosso verificar um horário disponível para você?`;
}
