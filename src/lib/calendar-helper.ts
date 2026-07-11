import { generateCalendarImage, getMonthOccupancy, buildDayListSections } from "./calendar-core";
import { sendMedia, sendList } from "./evolution-api";
import { BRAND_DEFAULT } from "./whatsapp-catalog";

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
