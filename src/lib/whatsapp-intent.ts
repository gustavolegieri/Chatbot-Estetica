import { CATALOG, CATEGORIES, MAIN_MENU_CATEGORIES } from "./whatsapp-catalog";

/** Número do menu principal (1–6 categorias) */
export function detectCategoryNum(text: string): number | null {
  const t = text.toLowerCase();
  if (/não sei|nao sei|qual serviço|qual servico|me indica|me ajuda|indeciso/.test(t)) return 6;
  if (/vidro|parabrisa/.test(t)) return 5;
  if (/descontamina|pintura|polimento|polir|cera nobre/.test(t)) return 4;
  if (/higieniza|interna|couro|estofado|tecido|carpete|cheiro/.test(t)) return 3;
  if (/motor|farol|farois|cristaliza.*farol/.test(t)) return 2;
  if (/lavagem|lavar|simples|completa|detalhad/.test(t)) return 1;
  return null;
}

/** Detecta serviço específico pelo texto */
export function detectServiceKey(text: string): string | null {
  const t = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/lavagem simples/, "lavagem_simples"],
    [/lavagem completa/, "lavagem_completa"],
    [/lavagem detalhada|detalhad/, "lavagem_detalhada"],
    [/motor/, "limpeza_motor"],
    [/farol|farois|cristaliza.*farol/, "cristalizacao_farois"],
    [/descontamina.*pintura|cera nobre/, "descontaminacao_pintura"],
    [/descontamina.*vidro|vidro/, "descontaminacao_vidro"],
    [/higieniza.*couro.*complet|couro.*teto|carpete.*couro/, "higienizacao_couro_completa"],
    [/higieniza.*couro|banco.*couro/, "higienizacao_couro"],
    [/higieniza.*tecido.*complet|teto.*carpete|banco.*tecido.*teto/, "higienizacao_tecido_completa"],
    [/higieniza.*tecido|banco.*tecido/, "higienizacao_tecido"],
    [/polimento|polir/, "polimento_cotacao"],
  ];
  for (const [re, key] of rules) {
    if (re.test(t)) return key;
  }
  const cat = detectCategoryNum(text);
  if (cat && cat !== 6) {
    const first = CATEGORIES[cat]?.keys[0];
    if (first && first !== "indeciso") return first;
  }
  return null;
}

export function wantsToSchedule(text: string, num: number | null): boolean {
  if (num === 1) return true;
  const t = text.toLowerCase().trim();
  return /agendar|agendamento|marcar|reservar|quero marcar|vamos agendar|bora agendar|fazer agendamento|quero agendar|1\s*[-–]?\s*agendar/i.test(
    t
  );
}

export function wantsOtherServices(text: string, num: number | null, menuOption = 2): boolean {
  if (num === menuOption) return true;
  const t = text.toLowerCase();
  return /outro servi|ver servi|mais servi|voltar ao menu|outros servi|serviços avulsos|servicos avulsos/i.test(
    t
  );
}

export function wantsDoubt(text: string, num: number | null): boolean {
  if (num === 3) return true;
  const t = text.toLowerCase();
  return /dúvida|duvida|pergunta|tenho uma dúvida|antes de agendar/i.test(t);
}

export function wantsRefusal(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /^(não quero|nao quero|cancelar|desistir|não preciso|nao preciso)$/.test(t) ||
    /não quero mais|nao quero mais|desisti|não vou|nao vou/.test(t)
  );
}

export function isGreetingOrSmallTalk(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    /^(oi|olá|ola|hey|e aí|eai|bom dia|boa tarde|boa noite|obrigad|valeu|ok|okay|blz|beleza|show|perfeito|entendi|tá|ta|sim|não|nao)$/.test(t) ||
    /^(pera|pera ai|perai|um momento|um instante|espera|aguarda|só um segundo|só um momento|pode ser|claro|com certeza|certo|entendido|ótimo|otimo|legal|massa|combinado|fechado)$/.test(t)
  );
}

export function onlyMenuNumber(text: string, max = MAIN_MENU_CATEGORIES): number | null {
  const t = text.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= max ? n : null;
}

export function subMenuForCategory(categoryNum: number): string {
  const cat = CATEGORIES[categoryNum];
  if (!cat) return "";
  const lines = cat.keys
    .filter((k) => k !== "indeciso")
    .map((key, i) => {
      const item = CATALOG[key];
      return `*${i + 1}* — ${item.label}`;
    });
  return [
    `*${cat.title}* — qual opção?`,
    ``,
    ...lines,
    ``,
    `*0* — Voltar ao menu principal`,
  ].join("\n");
}
