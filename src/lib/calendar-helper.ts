import { generateCalendarImage, getMonthOccupancy, buildDayListSections } from "./calendar-core";
import { sendMedia, sendList } from "./evolution-api";
import { BRAND_DEFAULT } from "./whatsapp-catalog";

/**
 * Gera apenas a imagem do calendário (sem enviar).
 * Pode ser usada tanto no whatsapp-flow (enviar via sendMedia) quanto no test-bot (retornar mediaUrl).
 * Usa dados reais de ocupação do banco (Prisma) e gera PNG via @napi-rs/canvas.
 * Fallback para placeholder se a biblioteca canvas não estiver disponível.
 *
 * @param date Data base para o calendário (default: hoje)
 * @returns URL pública da imagem gerada
 */
export async function generateCalendarImageOnly(date: Date = new Date()): Promise<string> {
  return await generateCalendarImage(date);
}

/**
 * Gera imagem do calendário com data customizada para testes.
 * Aceita string de data no formato YYYY-MM-DD.
 */
export async function generateCalendarImageOnlyForTest(testDate: string | null): Promise<string> {
  const date = testDate ? new Date(testDate) : new Date();
  const customToday = testDate ? new Date(testDate) : undefined;
  return await generateCalendarImage(date, customToday);
}

/**
 * Gera o texto explicativo com a legenda do calendário.
 * Pode ser usado tanto no whatsapp-flow quanto no test-bot.
 */
export function generateCalendarLegend(): string {
  return [
    "",
    "✅ Dias disponíveis:",
    "🟢 Mais vazio  🟡 Médio  🔴 Mais movimentado",
    "🚫 Domingos: fechado",
    "📍 Hoje: destacado em azul",
    "",
    "💬 *Digite o número do dia* (ex: 15)",
    "🔙 *0* para voltar ao menu",
  ].join("\n");
}

/**
 * Envia calendário como imagem + lista interativa WhatsApp.
 * Usa dados reais de ocupação do banco (Prisma) e gera PNG via @napi-rs/canvas.
 * Fallback para placeholder se a biblioteca canvas não estiver disponível.
 *
 * @param number WhatsApp number (international format)
 * @param prompts Prompt map opcional (compatibilidade)
 */
export async function sendCalendarWithImageAndList({ number, prompts }: { number: string; prompts?: any }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // 1. Gera e envia a IMAGEM do calendário
  const imagePath = await generateCalendarImage(today);
  await sendMedia({ number, mediaUrl: imagePath, caption: "📅 Calendário de disponibilidade" });

  // 2. Busca dados reais de ocupação
  const { occupancyMap } = await getMonthOccupancy(year, month);

  // 3. Monta seções da List Message
  const sections = buildDayListSections(occupancyMap, month, year);

  if (sections.length === 0) {
    // Nenhum dia disponível
    await sendMedia({
      number,
      mediaUrl: imagePath,
      caption: "Nenhum dia disponível neste mês. Tente novamente mais tarde.",
    });
    return;
  }

  // 4. Envia a lista interativa
  const totalRows = sections.reduce((acc, s) => acc + s.rows.length, 0);
  if (totalRows === 0) return;

  // WhatsApp List Message: máximo 10 itens no total, agrupados em até 10 seções
  // A WASender API aceita seções com rows dentro
  await sendList({
    number,
    title: "Escolha o dia",
    description: "Toque no dia desejado:",
    buttonText: "Ver dias",
    sections,
  });
}
