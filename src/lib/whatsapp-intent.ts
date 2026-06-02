import { CATALOG, CATEGORIES } from "./whatsapp-catalog";

/** Número do menu principal (1–8 categorias) */
export function detectCategoryNum(text: string): number | null {
  const t = text.toLowerCase();
  if (/não sei|nao sei|qual serviço|qual servico|me indica|me ajuda|indeciso/.test(t)) return 8;
  if (/pacote|combo|complet|full detail|premium combo/.test(t)) return 7;
  if (/motor|farol|farois|chuva ácida|chuva acida/.test(t)) return 6;
  if (/revitaliza|descontamina|limpeza premium/.test(t)) return 5;
  if (/higieniza|interna|couro|estofado|cheiro/.test(t)) return 4;
  if (/vitrifica|cerami|cristaliza|espelhamento|proteção|protecao/.test(t)) return 3;
  if (/polimento|polir|riscos?|swirl|espelho/.test(t)) return 2;
  if (/lavagem|lavar|detalhad|técnica|tecnica/.test(t)) return 1;
  return null;
}

/** Detecta serviço específico pelo texto */
export function detectServiceKey(text: string): string | null {
  const t = text.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/lavagem técnica|lavagem tecnica/, "lavagem_tecnica"],
    [/lavagem detalhada|detalhad/, "lavagem_detalhada"],
    [/polimento técnico|polimento tecnico/, "polimento_tecnico"],
    [/polimento comercial/, "polimento_comercial"],
    [/polimento|polir/, "polimento_tecnico"],
    [/proteção cerâmica|protecao ceramica|ceramic/, "protecao_ceramica"],
    [/vitrifica/, "vitrificacao"],
    [/cristaliza/, "cristalizacao"],
    [/espelhamento|espelho/, "espelhamento"],
    [/higieniza|interna/, "higienizacao_interna"],
    [/couro|hidratação|hidratacao/, "hidratacao_couro"],
    [/revitaliza/, "revitalizacao_pintura"],
    [/descontamina/, "descontaminacao"],
    [/limpeza premium/, "limpeza_premium"],
    [/motor/, "limpeza_motor"],
    [/farol|farois/, "restauracao_farois"],
    [/chuva ácida|chuva acida/, "chuva_acida"],
    [/pacote|combo/, "pacotes"],
  ];
  for (const [re, key] of rules) {
    if (re.test(t)) return key;
  }
  const cat = detectCategoryNum(text);
  if (cat && cat !== 8) {
    const first = CATEGORIES[cat]?.keys[0];
    if (first && first !== "indeciso" && first !== "pacotes") return first;
  }
  return null;
}

/** Opção 1 ou texto livre: agendar, agendamento, marcar… */
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

export function isGreetingOrSmallTalk(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(oi|olá|ola|hey|e aí|eai|bom dia|boa tarde|boa noite|obrigad|valeu|ok|okay|blz|beleza|show|perfeito|entendi|tá|ta|sim|não|nao)$/.test(
    t
  );
}

export function onlyMenuNumber(text: string, max = 8): number | null {
  const t = text.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= max ? n : null;
}

export function subMenuForCategory(categoryNum: number): string {
  const cat = CATEGORIES[categoryNum];
  if (!cat) return "";
  const lines = cat.keys
    .filter((k) => k !== "indeciso" && k !== "pacotes")
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
