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
    "Janeiro", "Fevereiro", "Março", "Abril",
    "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const year = date.getFullYear();
  const month = date.getMonth();
  const todayNum = date.getDate();
  const todayDate = new Date(year, month, todayNum);
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay.getDay();

  // Dias simulados de ocupação (exemplo)
  const busyDays = new Set([3, 5, 8, 12, 15, 19, 22, 26, 29]);
  const lightDays = new Set([2, 6, 10, 14, 18, 24, 28]);

  // Cada célula deve ter largura fixa: emoji (1) + 2 dígitos = 3
  const cell = (emoji: string, d: number) => `${emoji}${d.toString().padStart(2, " ")}`;
  const emptyCell = "   ";
  const separator = " ";

  const weeks: string[] = [];
  let day = 1;

  for (let row = 0; row < 6; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < 7; col += 1) {
      if (row === 0 && col < startDay) {
        cells.push(emptyCell);
      } else if (day > daysInMonth) {
        cells.push(emptyCell);
      } else {
        const dayDate = new Date(year, month, day);
        const isPast = dayDate < todayDate;
        const isToday = day === todayNum;
        const isSunday = col === 0;

        if (isPast || isSunday) {
          cells.push(cell("⛔", day));
        } else if (isToday) {
          cells.push(cell("🔵", day));
        } else if (busyDays.has(day)) {
          cells.push(cell("🔴", day));
        } else if (lightDays.has(day)) {
          cells.push(cell("🟡", day));
        } else {
          cells.push(cell("🟢", day));
        }
        day += 1;
      }
    }
    weeks.push(cells.join(separator));
    if (day > daysInMonth) break;
  }

  // Cabeçalho do mês
  const monthHeader = `  ${monthNames[month].toUpperCase()} ${year}`;

  // Cabeçalho dos dias da semana
  const dayHeader = weekdayNames.map((n) => n.padStart(3)).join(" ");

  // Lista numerada apenas dos dias disponíveis (futuros e não domingo)
  const availableDays: { num: number; name: string; occ: string; emoji: string }[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dayDate = new Date(year, month, d);
    const isPast = dayDate < todayDate;
    const isSunday = dayDate.getDay() === 0;
    if (isPast || isSunday) continue;
    const emoji = busyDays.has(d) ? "🔴" : lightDays.has(d) ? "🟡" : "🟢";
    const weekDay = weekdayNames[dayDate.getDay()];
    availableDays.push({ num: d, name: weekDay, occ: emoji, emoji });
  }

  // Lista compacta em linhas
  const availableLines: string[] = [];
  for (let i = 0; i < availableDays.length; i += 1) {
    const d = availableDays[i];
    const dayStr = d.num.toString().padStart(2, " ");
    availableLines.push(`  ${d.emoji}  Dia ${dayStr} — ${d.name}`);
  }

  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    `  ${monthHeader}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    `  ${dayHeader}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    ...weeks.map((w) => `  ${w}`),
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "🟢  Disponível    🔴  Quase lotado",
    "🟡  Poucas vagas  ⛔  Fechado/Passado",
    "🔵  Hoje",
    "",
    "📋 *Dias para agendar:*",
    ...availableLines,
    "",
    "💬 *Digite o número do dia* (ex: 15)",
    "🔙 *0* para voltar",
  ].join("\n");
}
