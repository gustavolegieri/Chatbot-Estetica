type Questionnaire = Record<string, unknown> | null | undefined;

export type StrategyScores = {
  autoridade: number;
  modernidade: number;
  feminilidade: number;
  formalidade: number;
  impacto: number;
  conforto: number;
};

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(text).join(' ');
  return String(value ?? '');
}

function corpus(q: Questionnaire): string {
  if (!q) return '';
  return [q.objetivosImagem, q.palavrasTransmitir, q.comoQuerSerLembrada, q.cargo,
    q.culturaEmpresa, q.ondeBemVestida, q.chamarAtencao, q.preferenciaRoupas,
    q.referenciasEsteticas, q.famosasReferencia, q.rotina, q.occasions]
    .map(text).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function clamp(value: number): number {
  return Math.max(20, Math.min(95, Math.round(value)));
}

/** Derives every visible strategy score from answers, never from display defaults. */
export function deriveStrategyScores(q: Questionnaire): StrategyScores | null {
  if (!q || Object.keys(q).length === 0) return null;
  const c = corpus(q);
  const has = (rx: RegExp) => rx.test(c);
  const comfortAnswer = Number(q.conforto || 0);
  let autoridade = 42, modernidade = 42, feminilidade = 38, formalidade = 40, impacto = 42;

  if (has(/autoridade|lider|lideranca|executiv|ceo|diretor|fundador|consultor|estrateg/)) autoridade += 34;
  if (has(/elegan|sofistic|seguranca|confianca|credibilidade|competencia/)) autoridade += 14;
  if (has(/modern|inov|contempor|atual|bauhaus|escandinav|minimal/)) modernidade += 35;
  if (has(/criativ|fashion|ousad|tendencia/)) modernidade += 12;
  if (has(/feminin|romantic|delicad|sensual/)) feminilidade += 38;
  if (has(/alfaiat|formal|corporat|reuniao|business|elegan|sofistic|executiv/)) formalidade += 34;
  if (has(/casual|descontraid|home office|esportiv/)) formalidade -= 14;
  if (has(/impact|marcante|ousad|chamar atencao|dramatic|fashion/)) impacto += 29;
  if (has(/discret|nao gosto de chamar|sem chamar/)) impacto -= 15;
  if (has(/presenca|autoridade|seguranca|modern/)) impacto += 10;
  const conforto = comfortAnswer >= 1 && comfortAnswer <= 5 ? 18 + comfortAnswer * 15 : has(/confort/) ? 72 : 50;

  return { autoridade: clamp(autoridade), modernidade: clamp(modernidade), feminilidade: clamp(feminilidade),
    formalidade: clamp(formalidade), impacto: clamp(impacto), conforto: clamp(conforto) };
}

export function questionnaireList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}
