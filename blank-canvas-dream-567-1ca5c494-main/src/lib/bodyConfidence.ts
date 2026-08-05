// Detects inconsistencies inside a body-analysis payload and produces a
// confidence score (0–100). Lower scores mean the AI biotype likely
// contradicts the reported measurements — the UI should surface a hint to
// re-run the analysis with a photo.

type Dict = Record<string, unknown>;

function norm(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function pick(obj: Dict | undefined, keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    const direct = obj[k];
    if (direct) return norm(direct);
    // also scan nested known sub-objects
  }
  // try nested objects (proporcoes / caracteristicas_fisicas)
  for (const k of ['proporcoes', 'caracteristicas_fisicas', 'medidas']) {
    const nested = obj[k];
    if (nested && typeof nested === 'object') {
      for (const key of keys) {
        const val = (nested as Dict)[key];
        if (val) return norm(val);
      }
    }
  }
  return '';
}

export interface BodyConfidenceResult {
  score: number; // 0-100
  warnings: string[];
}

export function computeBodyConfidence(data: Dict | null | undefined): BodyConfidenceResult {
  if (!data) return { score: 0, warnings: ['Dados insuficientes'] };

  const tipo = norm(data.tipo_corporal);
  const cintura = pick(data, ['cintura', 'waist']);
  const ombros = pick(data, ['ombros', 'shoulders']);
  const quadril = pick(data, ['quadril', 'quadris', 'hips']);

  let score = 100;
  const warnings: string[] = [];

  const definida = /(defin|marc|estreit|fin)/.test(cintura);
  const reta = /(reta|pouco|sem definic|larg)/.test(cintura);

  if (/retangulo|retângulo/.test(tipo) && definida) {
    score -= 35;
    warnings.push('Retângulo costuma ter cintura pouco marcada.');
  }
  if (/ampulheta/.test(tipo) && reta) {
    score -= 35;
    warnings.push('Ampulheta exige cintura bem definida.');
  }
  if (/triangulo invertido|triângulo invertido/.test(tipo) && /(estreit|fin)/.test(ombros)) {
    score -= 30;
    warnings.push('Triângulo invertido tem ombros mais largos que o quadril.');
  }
  if (/^pera$|pera /.test(tipo) && /(estreit|fin)/.test(quadril)) {
    score -= 30;
    warnings.push('Pera tem quadris mais largos que os ombros.');
  }
  if (/oval/.test(tipo) && /(estreit|fin)/.test(cintura)) {
    score -= 25;
    warnings.push('Oval normalmente tem volume na região central.');
  }

  if (!tipo) {
    score -= 40;
    warnings.push('Biotipo não detectado.');
  }

  return { score: Math.max(0, Math.min(100, score)), warnings };
}
