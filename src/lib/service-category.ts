export interface ServiceCategoryLike {
  categoryNum?: number | null;
  catalogKey?: string | null;
  name?: string | null;
  description?: string | null;
}

function normalizeCategory(categoryNum: number | null | undefined): number | null {
  if (categoryNum == null) return null;
  if (Number.isNaN(categoryNum)) return null;
  if (categoryNum < 1 || categoryNum > 8) return null;
  return categoryNum;
}

export function resolveServiceCategoryNum(service: ServiceCategoryLike): number {
  const explicit = normalizeCategory(service.categoryNum);
  if (explicit) return explicit;

  const haystack = `${service.catalogKey ?? ""} ${service.name ?? ""} ${service.description ?? ""}`.toLowerCase();

  if (/cristal|enceramento|vitrif|cera|protec|ceram|brilho|farol|farois/.test(haystack)) return 3;
  if (/higien|couro|estof|tecido|banco|tapete|interior/.test(haystack)) return 4;
  if (/revital|plasti|plastic|recondi|restaur/.test(haystack)) return 5;
  if (/motor|detalh|vidro|limpeza|descontamin|premium/.test(haystack)) return 6;
  if (/pacote|combo|kit|completo/.test(haystack)) return 7;
  if (/ajuda|consult|indeciso|escolh/.test(haystack)) return 8;
  if (/polimento|polir|correção|correcao|retoque/.test(haystack)) return 2;
  if (/lavagem|lava|lavaj|chuveiro/.test(haystack)) return 1;

  return 1;
}
