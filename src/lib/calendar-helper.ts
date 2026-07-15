import { generateCalendarImage, getMonthOccupancy, buildDayListSections } from "./calendar-core";
import { sendMedia, sendList, sendText } from "./evolution-api";
import { BRAND_DEFAULT } from "./whatsapp-catalog";
import { convertAndUploadCalendar, savePngLocally } from "./calendar-converter";

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
 * Converte SVG para PNG como no fluxo de produção para compatibilidade com WhatsApp.
 */
export async function generateCalendarImageOnlyForTest(testDate: string | null): Promise<string> {
  const date = testDate ? new Date(testDate) : new Date();
  const customToday = testDate ? new Date(testDate) : undefined;
  
  // 1. Gera o SVG do calendário
  const svgDataUrl = await generateCalendarImage(date, customToday);
  console.log("[Calendar Test] SVG gerado:", svgDataUrl.substring(0, 100) + "...");

  // 2. Extrai o SVG da data URL
  const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
  const svgBuffer = Buffer.from(svgString, 'base64');
  const svgContent = svgBuffer.toString('utf-8');

  // 3. Tenta converter SVG para PNG como no fluxo de produção
  try {
    console.log("[Calendar Test] Tentando converter SVG para PNG...");
    
    // Gerar nome de arquivo único baseado na data
    const timestamp = Date.now();
    const year = date.getFullYear();
    const month = date.getMonth();
    const filename = `calendar-test-${year}-${String(month + 1).padStart(2, '0')}-${timestamp}.png`;
    
    const conversionResult = await convertAndUploadCalendar(svgContent, filename, {
      width: 1080,  // Largura ideal para WhatsApp
      quality: 90
    });

    if (conversionResult.success && conversionResult.url) {
      console.log("[Calendar Test] SVG convertido para PNG:", conversionResult.url);
      return conversionResult.url;
    } else {
      console.log("[Calendar Test] Conversão falhou, usando SVG:", conversionResult.error);
      return svgDataUrl; // Fallback para SVG
    }
  } catch (err) {
    console.log("[Calendar Test] Erro na conversão, usando SVG:", err);
    return svgDataUrl; // Fallback para SVG
  }
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

  // 1. Gera o SVG do calendário
  const svgDataUrl = await generateCalendarImage(today);
  console.log("[Calendar] SVG gerado:", svgDataUrl.substring(0, 100) + "...");

  // 2. Extrai o SVG da data URL
  const svgString = svgDataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
  const svgBuffer = Buffer.from(svgString, 'base64');
  const svgContent = svgBuffer.toString('utf-8');

  // 3. Tenta converter SVG para PNG e salvar no diretório público
  let finalImageUrl = svgDataUrl; // Fallback para SVG
  let imageType = "SVG";

  try {
    console.log("[Calendar] Tentando converter SVG para PNG e salvar no diretório público...");
    
    // Gerar nome de arquivo único baseado na data
    const timestamp = Date.now();
    const filename = `calendar-${year}-${String(month + 1).padStart(2, '0')}-${timestamp}.png`;
    
    const conversionResult = await convertAndUploadCalendar(svgContent, filename, {
      width: 1080,  // Largura ideal para WhatsApp
      quality: 90
    });

    if (conversionResult.success && conversionResult.url) {
      finalImageUrl = conversionResult.url;
      imageType = "PNG";
      console.log("[Calendar] SVG convertido para PNG e salvo:", conversionResult.url);
      console.log("[Calendar] Passos:", conversionResult.steps.join(', '));
    } else if (conversionResult.fallbackText) {
      // Se todos os serviços de upload falharam, usa o fallback de texto
      console.log("[Calendar] Todos os serviços de upload falharam, usando texto:", conversionResult.error);
      await sendText({
        number,
        text: conversionResult.fallbackText,
      });
      // Continua com o fluxo normal da lista
    } else {
      console.log("[Calendar] Conversão falhou, usando SVG:", conversionResult.error);
    }
  } catch (err) {
    console.log("[Calendar] Erro na conversão, usando SVG:", err);
  }

  // 4. Tenta enviar a IMAGEM do calendário
  let imageSent = false;
  try {
    console.log("[Calendar] Enviando imagem como", imageType);
    const result = await sendMedia({ 
      number, 
      mediaUrl: finalImageUrl, 
      caption: "📅 Calendário de disponibilidade" 
    });
    console.log("[Calendar] Resultado do envio:", result);
    
    // Verifica se o envio foi bem-sucedido (não retornou erro)
    const hasError = result && typeof result === 'object' && 'error' in result;
    const isBlocked = result && typeof result === 'object' && 'blocked' in result;
    
    if (result && !hasError && !isBlocked) {
      imageSent = true;
      console.log("[Calendar] Imagem enviada com sucesso");
    } else {
      console.log("[Calendar] Falha ao enviar imagem, usando fallback de texto");
    }
  } catch (err) {
    console.log("[Calendar] Erro ao enviar imagem, usando fallback de texto:", err);
  }

  // 5. Se a imagem falhou, envia apenas a legenda em texto
  if (!imageSent) {
    await sendText({
      number,
      text: generateCalendarLegend(),
    });
  }

  // 6. Busca dados reais de ocupação
  const { occupancyMap } = await getMonthOccupancy(year, month);

  // 7. Monta seções da List Message
  const sections = buildDayListSections(occupancyMap, month, year);

  if (sections.length === 0) {
    // Nenhum dia disponível
    await sendText({
      number,
      text: "Nenhum dia disponível neste mês. Tente novamente mais tarde.",
    });
    return;
  }

  // 8. Envia a lista interativa
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
