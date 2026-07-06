export interface VehicleCollectionData {
  model: string | null;
  year: string | null;
  color: string | null;
  condition: string | null;
}

export function isValidCustomerName(input: string | null | undefined): boolean {
  const value = (input ?? "").trim();
  if (!value) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^(sim|nao|não|não|menu|ok|claro|help|ajuda)$/i.test(value)) return false;
  if (value.length < 2 || value.length > 40) return false;
  if (!/[a-zA-ZÀ-ú]/.test(value)) return false;
  return true;
}

export function buildVehicleCollectionPrompt(data: VehicleCollectionData): string {
  const lines = [
    "🚘 *Dados do veículo*",
    "",
    data.model ? `Modelo: ${data.model}` : "📌 Modelo: (ainda não informado)",
    data.year ? `Ano: ${data.year}` : "📅 Ano: (ainda não informado)",
    data.color ? `Cor: ${data.color}` : "🎨 Cor: (ainda não informado)",
    data.condition ? `Estado: ${data.condition}` : "🔧 Estado: (ainda não informado)",
    "",
    "Envie os dados que faltam, por exemplo:",
    "Honda Civic 2020, preto, bom",
  ];

  return lines.join("\n");
}
