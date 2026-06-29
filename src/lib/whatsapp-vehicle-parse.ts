export interface ParsedVehicle {
  raw: string;
  model: string;
  year: string;
  color: string;
  condition: string;
  summary: string;
  isSuv: boolean;
  hasData: boolean;
}

const COLORS = [
  "preto",
  "branco",
  "prata",
  "cinza",
  "vermelho",
  "azul",
  "verde",
  "bege",
  "marrom",
  "dourado",
  "champagne",
];

const SUV_HINTS =
  /suv|pickup|picape|van|camionete|4x4|hilux|ranger|s10|toro|compass|renegade|t-cross|creta|hrv|hr-v|sw4|amarok|duster|ecosport|tiguan|jeep|corolla cross|l200|frontier|saveiro/i;

const CAR_BRANDS =
  /\b(fiat|volkswagen|vw|chevrolet|gm|ford|toyota|honda|hyundai|jeep|nissan|renault|peugeot|citroën|citroen|bmw|mercedes|audi|volvo|mitsubishi|suzuki|kia|chery|byd|ram|dodge|mini|land rover|porsche)\b/i;

const CAR_MODELS =
  /\b(civic|corolla|hilux|onix|hb20|gol|polo|argo|compass|renegade|t-cross|creta|kicks|fit|city|hr-v|hrv|sw4|ranger|s10|toro|amarok|jetta|uno|mobi|strada|saveiro|sandero|logan|duster|tracker|cruze|spin|equinox|tiguan|taos|nivus|virtus|kwid|captur|duster|sandero|i30|creta|tucson|sportage|outlander|asx|l200|frontier|maverick|ranger|ecosport|fiesta|focus|ka|sandero|logan|clio|208|2008|3008|c4|journey|compass|renegade|commander|wrangler|cherokee)\b/i;

const NOT_VEHICLE_TEXT =
  /agendamento|agendar|marcar|reservar|menu|dúvida|duvida|lavagem|polimento|vitrifica|higieniza|obrigad|valeu|bom dia|boa tarde|boa noite|oi|olá|ola|quero|preciso|serviço|servico|horário|horario|pagamento|pix/i;

import { isGreetingOrSmallTalk } from "./whatsapp-intent";

const NOT_A_NAME =
  /agendamento|agendar|marcar|reservar|menu|lavagem|polimento|vitrifica|higieniza|cristaliza|pacote|serviço|servico|obrigad|valeu|bom dia|boa tarde|quero|preciso|horário|horario|pagamento|pix|^\d+$/i;

export function parseYearFromText(text: string): string | null {
  const m = text.match(/\b(19[89]\d|20[0-2]\d)\b/);
  return m ? m[0] : null;
}

/** Modelo + ano obrigatórios e texto precisa parecer veículo */
export function isValidVehicle(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || NOT_VEHICLE_TEXT.test(t)) return false;

  const year = parseYearFromText(t);
  if (!year) return false;

  const withoutYear = t.replace(year, "").replace(/\s+/g, " ").trim();
  if (withoutYear.length < 2) return false;
  if (!/[a-zA-ZÀ-ú]{2,}/.test(withoutYear)) return false;

  if (CAR_BRANDS.test(t) || CAR_MODELS.test(t) || SUV_HINTS.test(t)) return true;

  const tokens = withoutYear
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(de|da|do|em|no|na|um|uma)$/i.test(w));
  return tokens.length >= 1;
}

export function parseModelFromText(text: string): string | null {
  const t = text.trim();
  if (!t || NOT_VEHICLE_TEXT.test(t) || /^\d+$/.test(t)) return null;

  if (isValidVehicle(t)) {
    const p = parseVehicleMessage(t);
    return p.model || null;
  }

  if (parseYearFromText(t)) return null;

  if (t.length < 2 || t.length > 50) return null;
  if (!/[a-zA-ZÀ-ú]{2,}/.test(t)) return null;

  const cleaned = t.replace(/[^\w\sÀ-ú\-]/gi, "").trim();
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  if (tokens.length === 0) return null;

  return tokens.join(" ");
}

export function parseVehicleMessage(text: string): ParsedVehicle {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  let year = parseYearFromText(raw) ?? "";
  let color = "";
  let condition = "";

  for (const c of COLORS) {
    if (lower.includes(c)) {
      color = c;
      break;
    }
  }

  if (/carro novo|zero km|seminovo|estado bom|pouco uso/i.test(lower)) {
    condition = "bom";
  } else if (/risco|arranh|oxida|sujo|mancha|opac|ruim|gasto|precisa/i.test(lower)) {
    condition = "precisa de atenção";
  }

  let model = raw;
  if (year) model = model.replace(year, "");
  if (color) model = model.replace(new RegExp(color, "i"), "");
  model = model.replace(/\s+/g, " ").trim();

  const isSuv = SUV_HINTS.test(raw);
  const valid = isValidVehicle(raw);
  const parts = [model, year].filter(Boolean);
  const summary = parts.join(" ").trim() || raw;

  return {
    raw,
    model,
    year,
    color,
    condition,
    summary,
    isSuv,
    hasData: valid,
  };
}

export function looksLikeVehicleOnly(text: string): boolean {
  return isValidVehicle(text);
}

export function looksLikePersonName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 35) return false;
  if (/^\d{1,2}$/.test(t)) return false;
  if (isGreetingOrSmallTalk(t)) return false;
  if (NOT_A_NAME.test(t)) return false;
  if (isValidVehicle(t)) return false;
  if (looksLikeVehicleOnly(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 3) return false;
  if (!/^[a-zA-ZÀ-ú'\s]+$/.test(t)) return false;

  return words.every((w) => w.length >= 2 && /^[A-Za-zÀ-ú]+$/i.test(w));
}

export function vehicleDisplayFromFlow(flow: {
  vehicleRaw?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColor?: string;
}): string {
  if (flow.vehicleModel && flow.vehicleYear) {
    return `${flow.vehicleModel} ${flow.vehicleYear}`;
  }
  if (flow.vehicleRaw && isValidVehicle(flow.vehicleRaw)) return flow.vehicleRaw;
  const parts = [flow.vehicleModel, flow.vehicleYear].filter(Boolean);
  return parts.join(" ").trim() || "seu veículo";
}

export function mergeVehicleIntoFlow(
  existing: Partial<ParsedVehicle>,
  incoming: ParsedVehicle
): ParsedVehicle {
  return {
    raw: incoming.raw || existing.raw || "",
    model: incoming.model || existing.model || "",
    year: incoming.year || existing.year || "",
    color: incoming.color || existing.color || "",
    condition: incoming.condition || existing.condition || "",
    summary: incoming.summary || existing.summary || "",
    isSuv: incoming.isSuv || existing.isSuv || false,
    hasData: incoming.hasData || !!existing.summary,
  };
}

export function vehicleDisplay(v: Partial<ParsedVehicle>): string {
  return v.summary || v.model || v.raw || "seu veículo";
}
