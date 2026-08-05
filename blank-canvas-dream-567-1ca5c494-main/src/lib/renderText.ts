export const toText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(' · ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const pick = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
    const name = pick('nome') || pick('name') || pick('titulo') || pick('title') || pick('peca') || pick('item');
    const desc =
      pick('descricao') || pick('description') || pick('texto') || pick('text') ||
      pick('acao') || pick('justificativa') || pick('motivo') || pick('por_que') ||
      pick('porque') || pick('explicacao');
    if (name && desc) return `${name} — ${desc}`;

    if (name) return name;
    if (desc) return desc;
    const first = Object.values(o).find((x) => typeof x === 'string') as string | undefined;
    return first ?? '';
  }
  return '';
};
