export interface VehicleCollectionData {
  model: string | null;
  year: string | null;
  color: string | null;
  condition: string | null;
}

const NONSENSE_NAME_TOKENS = /^(ffds|asdf|qwerty|zxcv|abcd|1234|test|teste|abc)$/i;

export function isValidCustomerName(input: string | null | undefined): boolean {
  const value = (input ?? "").trim();
  if (!value) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^(sim|nao|não|menu|ok|claro|help|ajuda)$/i.test(value)) return false;
  if (NONSENSE_NAME_TOKENS.test(value)) return false;
  if (value.length < 2 || value.length > 40) return false;
  if (!/[a-zA-ZÀ-ú]/.test(value)) return false;
  if (!/[aeiouáéíóúàèìòùâêîôûãõ]/i.test(value)) return false;
  if (/^([A-Za-zÀ-ú])\1+$/.test(value)) return false;
  return true;
}

export function normalizeVehicleConditionValue(value: string | null | undefined): string {
  const normalized = (value ?? "").toLowerCase().trim();
  if (!normalized) return "normal";
  if (/(excelente|novo|zero km|seminovo|otimo|ótimo)/.test(normalized)) return "excelente";
  if (/(bom|bom estado|pouco uso|bem|limpo)/.test(normalized)) return "bom";
  if (/(ruim|arranh|feio|sujei|muito sujo|mancha|oxida|opac|precisa de atenção|precisa de atencao|gasto|precisa)/.test(normalized)) {
    return "precisa de atenção";
  }
  return "normal";
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
    "Modelo: Honda Civic",
    "Ano: 2020",
    "Cor: Preto",
    "Estado: Bom estado",
  ];

  return lines.join("\n");
}

export function buildVehicleConfirmationPrompt(data: VehicleCollectionData): string {
  const model = data.model || "—";
  const year = data.year || "—";
  const color = data.color || "—";
  const condition = data.condition || "—";

  return [
    "🚘 *Confirmando os dados do veículo*",
    "",
    `Modelo: ${model}`,
    `Ano: ${year}`,
    `Cor: ${color}`,
    `Estado: ${condition}`,
    "",
    "Confirma esses dados? (sim/não)",
  ].join("\n");
}

export function buildCalendarPrompt(date = new Date()): string {
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const year = date.getFullYear();
  const month = date.getMonth();
  const today = date.getDate();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay.getDay();
  const busyDays = new Set([3, 5, 8, 12, 15, 19, 22, 26, 29]);
  const lightDays = new Set([2, 6, 10, 14, 18, 24, 28]);

  const weeks: string[][] = [];
  let day = 1;
  for (let row = 0; row < 6; row += 1) {
    const week: string[] = [];
    for (let col = 0; col < 7; col += 1) {
      if (row === 0 && col < startDay) {
        week.push("   ");
      } else if (day > daysInMonth) {
        week.push("   ");
      } else {
        const dayNumber = day.toString().padStart(2, "0");
        const isToday = day === today;
        const marker = isToday
          ? "["
          : busyDays.has(day) ? "🔴"
          : lightDays.has(day) ? "🟡"
          : "🟢";
        const cell = isToday ? `[${dayNumber}]` : `${marker}${dayNumber}`;
        week.push(cell);
        day += 1;
      }
    }
    weeks.push(week);
    if (day > daysInMonth) break;
  }

  const rows = weeks.map((week) => week.join(" "));

  return [
    `📅 ${monthNames[month]} ${year}`,
    weekdayNames.join(" "),
    ...rows,
    "",
    "✅ Dias disponíveis: 🟢 mais vazio, 🟡 médio, 🔴 mais movimentado",
    "🚫 Domingos: fechado",
    "📍 Hoje: dia entre colchetes [ ]",
    "🔙 Digite 0 para voltar ao início",
    "",
    "Me diga o dia que prefere (ex: 08/07).",
  ].join("\n");
}
