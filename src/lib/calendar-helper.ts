import { generateCalendarImage } from "./calendar-core";
import { sendMedia, sendText } from "./evolution-api";
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
    "📅 *Escolha o melhor dia no calendário*",
    "",
    "Envie a data desejada, por exemplo: *19/08*.",
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
export async function sendCalendarWithImageAndList({
  number,
  prompts: _prompts,
  caption,
}: {
  number: string;
  prompts?: unknown;
  caption?: string;
}) {
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
      return sendText({
        number,
        text: [caption?.trim() || generateCalendarLegend(), conversionResult.fallbackText]
          .filter(Boolean)
          .join("\n\n"),
      });
    } else {
      console.log("[Calendar] Conversão falhou, usando SVG:", conversionResult.error);
    }
  } catch (err) {
    console.log("[Calendar] Erro na conversão, usando SVG:", err);
  }

  // 4. Tenta enviar a IMAGEM do calendário
  let imageSent = false;
  try {
    console.log("[Calendar] Enviando imagem como", imageType, "para", number);
    console.log("[Calendar] URL da imagem:", finalImageUrl.substring(0, 100) + "...");
    const result = await sendMedia({
      number, 
      mediaUrl: finalImageUrl, 
      caption: caption?.trim() || generateCalendarLegend(),
    });
    console.log("[Calendar] Resultado do envio:", JSON.stringify(result));
    
    // Verifica se o envio foi bem-sucedido (não retornou erro)
    const hasError = Boolean(result && typeof result === 'object' && (result as { error?: boolean }).error);
    const isBlocked = Boolean(result && typeof result === 'object' && (result as { blocked?: boolean }).blocked);
    
    if (result && !hasError && !isBlocked) {
      imageSent = true;
      console.log("[Calendar] ✅ Imagem enviada com sucesso");
      return result;
    } else {
      console.log("[Calendar] ❌ Falha ao enviar imagem - hasError:", hasError, "isBlocked:", isBlocked);
      if (hasError) {
        console.log("[Calendar] Detalhes do erro:", (result as any).error);
      }
    }
  } catch (err) {
    console.log("[Calendar] ❌ Erro ao enviar imagem, usando fallback de texto:", err);
    console.log("[Calendar] Tipo do erro:", (err as Error).name);
    console.log("[Calendar] Mensagem do erro:", (err as Error).message);
  }

  // 5. Se a imagem falhou, envia apenas a legenda em texto
  if (!imageSent) {
    return sendText({
      number,
      text: caption?.trim() || generateCalendarLegend(),
    });
  }

  // A imagem já contém todos os dias. Não enviamos uma segunda lista porque
  // ela duplicava a escolha e, em caso de rate limit, podia chegar quando o
  // cliente já estava na etapa de pagamento.
}
