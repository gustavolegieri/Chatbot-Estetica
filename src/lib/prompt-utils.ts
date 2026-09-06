/** Utilitários de prompt — seguros para client e server */

export function applyPrompt(template: string, vars: Record<string, string | undefined | null>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value ?? "");
  }
  return out
    .split("\n")
    .filter((line, i, arr) => {
      if (line.trim() !== "") return true;
      const prev = arr[i - 1];
      return prev !== undefined && prev.trim() !== "";
    })
    .join("\n")
    .trim();
}

export function parseVariables(hint: string | null | undefined): string[] {
  if (!hint) return [];
  const matches = hint.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

export const CATEGORY_LABELS: Record<string, string> = {
  fluxo: "Fluxo principal",
  automacao: "Automações",
  categorias: "Categorias do menu",
};

export const SAMPLE_PREVIEW_VARS: Record<string, string> = {
  businessName: "Garagem do Ka",
  address: "Rua das Oficinas, 100 — São Paulo, SP",
  hours: "Segunda a sábado, 08:00 às 18:00",
  clientName: "João",
  menu: "*1* 💧 Lavagem\n*2* ✨ Polimento\n*3* 🛡️ Proteção & Brilho",
  model: "Civic",
  name: "João",
  vehicle: "Civic 2021 prata",
  service: "Polimento Técnico",
  valueLine: "💰 *R$ 380 a R$ 580*",
  time: "3h a 6h",
  pitch: "✨ Recupera o brilho e o aspecto premium da pintura.",
  complement: "Vitrificação",
  benefit: "protege o brilho do polimento por muito mais tempo.",
  dayLabel: "Sexta-feira",
  slots: "*1* — 09:00\n*2* — 10:00\n*3* — 11:00",
  durationLabel: "4h",
  options: "*1* PIX\n*2* Débito\n*3* Crédito\n*4* Dinheiro",
  pixKey: "11999999999",
  pixHolder: "Garagem do Ka LTDA",
  bankLine: "🏦 *Banco:* Nubank",
  businessName2: "Garagem do Ka",
  services: "Polimento Técnico",
  day: "28/06/2026 (Sexta)",
  payment: "PIX",
  value: "R$ 380 a R$ 580",
  pixBlock: "",
  contextLine: "Você estava vendo *Polimento Técnico* para o seu *Civic 2021* 🚗",
  continueLine: "Bora continuar de onde paramos?",
  brand: "Garagem do Ka",
  duration: "4h",
  dateLabel: "Sexta, 28/06",
  addressLine: "📍 Rua das Oficinas, 100",
  reason: "O horário foi liberado por falta de confirmação.",
};

/** Renderiza preview WhatsApp: *bold* → negrito, _italic_ → itálico */
export function renderWhatsAppHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .split("\n")
    .map((line) => (line === "" ? "<br/>" : `<span>${line}</span><br/>`))
    .join("");
}

/**
 * Converte a saída Markdown dos modelos para a formatação do WhatsApp.
 *
 * O WhatsApp usa `*negrito*`, e não o `**negrito**` do Markdown. Como os
 * modelos respondem em Markdown por padrão, sem esta conversão o cliente
 * recebia literalmente `**Lavagem Completa**`, com os asteriscos à mostra.
 * Títulos `###` viram negrito e marcadores `-` viram bullet, porque o WhatsApp
 * não formata nenhum dos dois.
 *
 * Vive aqui, e não em `whatsapp-ai`, porque `whatsapp-ai` e
 * `whatsapp-ai-enhanced` se importam mutuamente — um utilitário neutro evita
 * que a ordem de avaliação dos módulos deixe a função indefinida em runtime.
 */
export function toWhatsAppMarkdown(text: string): string {
  return text
    .replace(/\*\*\*([^\n*]+)\*\*\*/g, "*$1*")
    .replace(/\*\*([^\n*]+)\*\*/g, "*$1*")
    .replace(/__([^\n_]+)__/g, "*$1*")
    .replace(/^#{1,6}\s*(.+)$/gm, "*$1*")
    .replace(/^\s*[-*]\s+(?=\S)/gm, "• ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
