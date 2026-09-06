/**
 * Cartões visuais do atendimento no WhatsApp.
 *
 * O resumo do agendamento já chegava como imagem; o resto da conversa era só
 * texto, e as etapas mais importantes — a abertura e a apresentação do serviço —
 * eram justamente as mais longas de ler. Aqui ficam os dois cartões que faltavam,
 * na mesma linguagem visual do resumo (fundo escuro, dourado, logo no topo),
 * para que a conversa inteira pareça a mesma marca.
 *
 * A régua é a de `summary-card.ts`: altura calculada antes de desenhar, nada de
 * `<svg>` aninhado e texto sempre com escape.
 */
import { renderLogo } from "./svg-utils";
import { uploadImageToCloudinary } from "./image-upload";
import { convertSvgToPng } from "./calendar-converter";

const LARGURA = 600;
const MARGEM = 24;
const OURO = "#FFD700";
// Os nomes sao os das familias reais empacotadas em public/fonts: o resvg
// resolve a fonte pelo nome, nao pelo @font-face embutido no SVG.
const FONTE = "Noto Sans, sans-serif";
const FONTE_TITULO = "Montserrat, Noto Sans, sans-serif";
const OURO_SUAVE = "#e0c060";

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Quebra em linhas por número de caracteres, já que a fonte é fixa. */
function quebrar(texto: string, maxCaracteres: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const proxima = atual ? `${atual} ${palavra}` : palavra;
    if (proxima.length <= maxCaracteres) {
      atual = proxima;
    } else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const FUNDO = `
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="divisor" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${OURO};stop-opacity:0" />
      <stop offset="50%" style="stop-color:${OURO};stop-opacity:0.5" />
      <stop offset="100%" style="stop-color:${OURO};stop-opacity:0" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" />
`;

async function publicar(svg: string, prefixo: string, alternativo: string): Promise<string | null> {
  try {
    const conversao = await convertSvgToPng(svg, { width: 900 });
    if (!conversao.success || !conversao.pngBuffer) throw new Error(conversao.error ?? "conversao falhou");
    const png = conversao.pngBuffer;
    const upload = await uploadImageToCloudinary(png, `${prefixo}-${Date.now()}`, "cards");
    if (upload.success && upload.url) return upload.url;
    console.error(`[Cartões] Upload de ${prefixo} falhou:`, upload.error);
  } catch (erro) {
    console.error(`[Cartões] Não foi possível gerar ${prefixo}:`, erro);
  }
  // Sem imagem o atendimento continua: quem chama envia só o texto.
  console.warn(`[Cartões] Seguindo sem imagem em ${prefixo} (${alternativo}).`);
  return null;
}

export interface WelcomeCardData {
  businessName: string;
  tagline: string;
  destaques: string[];
  address: string;
  hours: string;
}

/** Capa da conversa: marca, o que fazemos e onde estamos. */
export async function generateWelcomeCard(data: WelcomeCardData): Promise<string | null> {
  const alturaLogo = 66;
  const topoConteudo = MARGEM + alturaLogo + 18;
  const alturaTitulo = 34;
  const alturaTagline = 22;
  const linhaDestaque = 34;

  const destaques = data.destaques.slice(0, 5);
  const alturaCartao = 20 + destaques.length * linhaDestaque + 16;
  const enderecoLinhas = quebrar(data.address, 44);
  // O rodapé cresce com o endereço: com duas linhas fixas, a segunda passava
  // por cima do horário de funcionamento.
  const alturaRodape = 30 + enderecoLinhas.length * 24 + 28;
  const alturaTotal =
    topoConteudo + alturaTitulo + alturaTagline + 22 + alturaCartao + alturaRodape + MARGEM;

  const logo = await renderLogo((LARGURA - 90) / 2, MARGEM, 90, alturaLogo);

  const destaquesSvg = destaques
    .map((item, indice) => {
      const y = 30 + indice * linhaDestaque;
      return `
        <circle cx="${MARGEM + 10}" cy="${y - 6}" r="4" fill="${OURO}" opacity="0.7"/>
        <text x="${MARGEM + 28}" y="${y}" fill="#ffffff" font-family="${FONTE}" font-size="19">${escapar(item)}</text>
      `;
    })
    .join("");

  const yCartao = topoConteudo + alturaTitulo + alturaTagline + 22;
  const yRodape = yCartao + alturaCartao + 30;
  const enderecoSvg = enderecoLinhas
    .map(
      (linha, indice) =>
        `<text x="${LARGURA / 2}" y="${yRodape + indice * 24}" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="16" text-anchor="middle">${escapar(linha)}</text>`
    )
    .join("");

  const svg = `
    <svg width="${LARGURA}" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${alturaTotal}">
      ${FUNDO}
      ${logo}
      <text x="${LARGURA / 2}" y="${topoConteudo + 26}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="30" font-weight="900" text-anchor="middle">${escapar(data.businessName.toUpperCase())}</text>
      <text x="${LARGURA / 2}" y="${topoConteudo + alturaTitulo + 16}" fill="#c8cbe0" font-family="${FONTE}" font-size="17" text-anchor="middle">${escapar(data.tagline)}</text>
      <rect x="${MARGEM}" y="${yCartao - 14}" width="${LARGURA - MARGEM * 2}" height="1" fill="url(#divisor)" />
      <g transform="translate(0, ${yCartao})">
        <rect x="${MARGEM}" y="0" width="${LARGURA - MARGEM * 2}" height="${alturaCartao}" fill="#20263f" rx="16" opacity="0.95"/>
        <rect x="${MARGEM}" y="0" width="${LARGURA - MARGEM * 2}" height="${alturaCartao}" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.15" rx="16"/>
        ${destaquesSvg}
      </g>
      ${enderecoSvg}
      <text x="${LARGURA / 2}" y="${yRodape + enderecoLinhas.length * 24 + 6}" fill="#888888" font-family="${FONTE}" font-size="15" text-anchor="middle">${escapar(data.hours)}</text>
    </svg>
  `;

  return publicar(svg, "boas-vindas", data.businessName);
}

export interface ServiceCardData {
  name: string;
  pitch: string;
  price: string;
  duration: string;
  includes: string[];
}

/**
 * Lê o texto de detalhe já escrito para o serviço e monta o cartão.
 *
 * A copy boa (o que inclui, a frase de efeito) já existe em
 * `whatsapp-flow-messages`; repetir tudo aqui criaria duas versões para manter.
 * O formato é estável: título com emoji, uma linha em itálico e itens com "•".
 */
export function serviceCardFromDetail(
  detalhe: string,
  fallback: { name: string; price: string; duration: string }
): ServiceCardData {
  const linhas = detalhe.split("\n").map((linha) => linha.trim());
  const titulo = linhas
    .find((linha) => /^[^\w\s]*\s*\*[^*]+\*/.test(linha))
    ?.replace(/^[^*]*\*/, "")
    .replace(/\*.*$/, "")
    .trim();
  const pitch = linhas.find((linha) => /^_[^_]+_$/.test(linha))?.replace(/^_|_$/g, "").trim();
  const includes = linhas
    .filter((linha) => linha.startsWith("•"))
    .map((linha) => linha.replace(/^•\s*/, "").trim())
    .filter(Boolean);

  return {
    name: titulo || fallback.name,
    pitch: pitch ?? "",
    price: fallback.price,
    duration: fallback.duration,
    includes: includes.length ? includes : [fallback.name],
  };
}

/** Vitrine do serviço escolhido: preço, tempo e o que está incluso. */
export async function generateServiceCard(data: ServiceCardData): Promise<string | null> {
  const alturaLogo = 52;
  const topo = MARGEM + alturaLogo + 14;
  const linhaItem = 30;
  // O ✓ marca o item, não a linha: uma frase que quebra em duas continua sendo
  // um item só, e a segunda linha entra recuada, sem marcador próprio.
  const itens = data.includes.slice(0, 7).flatMap((item) =>
    quebrar(item, 44)
      .slice(0, 2)
      .map((texto, indice) => ({ texto, primeira: indice === 0 }))
  );

  const alturaFaixa = 74;
  const alturaLista = 26 + itens.length * linhaItem + 16;
  const alturaTitulo = 36;
  const alturaPitch = data.pitch ? 26 : 0;
  const alturaTotal = topo + alturaTitulo + alturaPitch + 16 + alturaFaixa + 18 + alturaLista + MARGEM + 12;

  const logo = await renderLogo((LARGURA - 74) / 2, MARGEM, 74, alturaLogo);

  const itensSvg = itens
    .map((item, indice) => {
      const y = 34 + indice * linhaItem;
      const marcador = item.primeira
        ? `<path d="M ${MARGEM + 8} ${y - 9} l 5 6 l 9 -12" stroke="${OURO}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        : "";
      return `
        ${marcador}
        <text x="${MARGEM + 32}" y="${y}" fill="#ffffff" font-family="${FONTE}" font-size="18">${escapar(item.texto)}</text>
      `;
    })
    .join("");

  const yFaixa = topo + alturaTitulo + alturaPitch + 16;
  const yLista = yFaixa + alturaFaixa + 18;
  const meio = LARGURA / 2;

  const svg = `
    <svg width="${LARGURA}" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${alturaTotal}">
      ${FUNDO}
      ${logo}
      <text x="${meio}" y="${topo + 28}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="27" font-weight="900" text-anchor="middle">${escapar(data.name.toUpperCase())}</text>
      ${
        data.pitch
          ? `<text x="${meio}" y="${topo + alturaTitulo + 16}" fill="#c8cbe0" font-family="${FONTE}" font-size="16" text-anchor="middle">${escapar(quebrar(data.pitch, 58)[0] ?? "")}</text>`
          : ""
      }
      <g transform="translate(0, ${yFaixa})">
        <rect x="${MARGEM}" y="0" width="${LARGURA - MARGEM * 2}" height="${alturaFaixa}" fill="${OURO}" opacity="0.1" rx="14"/>
        <text x="${MARGEM + 34}" y="30" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="15" font-weight="500">INVESTIMENTO</text>
        <text x="${MARGEM + 34}" y="58" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="27" font-weight="900">${escapar(data.price)}</text>
        <text x="${LARGURA - MARGEM - 34}" y="30" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="15" font-weight="500" text-anchor="end">DURAÇÃO</text>
        <text x="${LARGURA - MARGEM - 34}" y="58" fill="#ffffff" font-family="${FONTE}" font-size="23" font-weight="bold" text-anchor="end">${escapar(data.duration)}</text>
      </g>
      <g transform="translate(0, ${yLista})">
        <rect x="${MARGEM}" y="0" width="${LARGURA - MARGEM * 2}" height="${alturaLista}" fill="#20263f" rx="16" opacity="0.95"/>
        <rect x="${MARGEM}" y="0" width="${LARGURA - MARGEM * 2}" height="${alturaLista}" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.15" rx="16"/>
        ${itensSvg}
      </g>
    </svg>
  `;

  return publicar(svg, "servico", data.name);
}
