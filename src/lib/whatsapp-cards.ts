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

export interface ProposalOption {
  /** "Essencial", "Recomendado", "Completo" — o degrau da escada. */
  tier: string;
  name: string;
  price: string;
  duration: string;
  bullets: string[];
  recommended?: boolean;
}

export interface ProposalCardData {
  vehicle: string;
  problema: string;
  options: ProposalOption[];
}

/**
 * Proposta em três degraus, no lugar da árvore de menus.
 *
 * O caminho antigo pedia categoria, depois serviço, depois veículo — três
 * respostas antes de o cliente ver qualquer preço. Aqui ele conta o problema em
 * uma frase e recebe a escada inteira em uma imagem: o que resolve o mínimo, o
 * que a equipe recomenda e o que entrega o máximo, cada um com preço e tempo.
 * A escolha vira um toque em botão.
 */
export async function generateProposalCard(data: ProposalCardData): Promise<string | null> {
  const alturaLogo = 46;
  const topo = MARGEM + alturaLogo + 12;
  const alturaCabecalho = 62;
  const linhaBullet = 24;
  const opcoes = data.options.slice(0, 3);

  const alturas = opcoes.map((opcao) => 84 + Math.min(opcao.bullets.length, 3) * linhaBullet);
  const alturaTotal =
    topo + alturaCabecalho + alturas.reduce((soma, altura) => soma + altura + 14, 0) + MARGEM + 16;

  const logo = await renderLogo((LARGURA - 66) / 2, MARGEM, 66, alturaLogo);
  const largura = LARGURA - MARGEM * 2;

  let y = topo + alturaCabecalho;
  const blocos = opcoes
    .map((opcao, indice) => {
      const altura = alturas[indice];
      const topoBloco = y;
      y += altura + 14;

      const destaque = opcao.recommended;
      const bullets = opcao.bullets
        .slice(0, 3)
        .map((bullet, i) => {
          const by = 76 + i * linhaBullet;
          const texto = quebrar(bullet, 42)[0] ?? bullet;
          return `
            <circle cx="${MARGEM + 26}" cy="${by - 5}" r="3" fill="${OURO}" opacity="0.75"/>
            <text x="${MARGEM + 40}" y="${by}" fill="#c8cbe0" font-family="${FONTE}" font-size="15">${escapar(texto)}</text>
          `;
        })
        .join("");

      return `
        <g transform="translate(0, ${topoBloco})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="${destaque ? "#252c4a" : "#20263f"}" rx="16"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="none" stroke="${OURO}" stroke-width="${destaque ? 2 : 1}" opacity="${destaque ? 0.55 : 0.14}" rx="16"/>
          <rect x="${MARGEM}" y="14" width="5" height="${altura - 28}" fill="${OURO}" opacity="${destaque ? 0.9 : 0.35}" rx="3"/>
          <text x="${MARGEM + 26}" y="30" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="13" font-weight="500">${escapar(`${indice + 1} · ${opcao.tier.toUpperCase()}`)}</text>
          <text x="${MARGEM + 26}" y="56" fill="#ffffff" font-family="${FONTE_TITULO}" font-size="21" font-weight="900">${escapar(opcao.name)}</text>
          <text x="${MARGEM + largura - 26}" y="34" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="25" font-weight="900" text-anchor="end">${escapar(opcao.price)}</text>
          <text x="${MARGEM + largura - 26}" y="56" fill="#8f96b8" font-family="${FONTE}" font-size="15" text-anchor="end">${escapar(opcao.duration)}</text>
          ${destaque ? `<rect x="${MARGEM + largura - 150}" y="${altura - 34}" width="124" height="24" fill="${OURO}" opacity="0.16" rx="12"/><text x="${MARGEM + largura - 88}" y="${altura - 17}" fill="${OURO}" font-family="${FONTE}" font-size="13" font-weight="bold" text-anchor="middle">RECOMENDADO</text>` : ""}
          ${bullets}
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg width="${LARGURA}" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${alturaTotal}">
      ${FUNDO}
      ${logo}
      <text x="${LARGURA / 2}" y="${topo + 24}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="22" font-weight="900" text-anchor="middle">SUA PROPOSTA</text>
      <text x="${LARGURA / 2}" y="${topo + 46}" fill="#8f96b8" font-family="${FONTE}" font-size="15" text-anchor="middle">${escapar(`${data.vehicle} · ${quebrar(data.problema, 40)[0] ?? ""}`)}</text>
      ${blocos}
    </svg>
  `;

  return publicar(svg, "proposta", data.vehicle);
}

export interface SlotOption {
  /** "Amanhã", "Terça" — o dia como a pessoa fala. */
  dia: string;
  data: string;
  hora: string;
  nota?: string;
}

/**
 * Agenda relâmpago: os três primeiros horários livres, grandes.
 *
 * O caminho antigo pedia semana, depois dia, depois período, depois horário —
 * quatro toques para marcar. Quase todo mundo quer "o mais cedo possível", e
 * essa é exatamente a informação que a lista escondia atrás de três telas.
 */
export async function generateSlotsCard(data: {
  service: string;
  vehicle: string;
  duracao: string;
  slots: SlotOption[];
}): Promise<string | null> {
  const alturaLogo = 44;
  const topo = MARGEM + alturaLogo + 10;
  const alturaCabecalho = 58;
  const alturaSlot = 76;
  const slots = data.slots.slice(0, 3);
  const alturaTotal = topo + alturaCabecalho + slots.length * (alturaSlot + 12) + 46 + MARGEM;

  const logo = await renderLogo((LARGURA - 62) / 2, MARGEM, 62, alturaLogo);
  const largura = LARGURA - MARGEM * 2;

  const blocos = slots
    .map((slot, indice) => {
      const y = topo + alturaCabecalho + indice * (alturaSlot + 12);
      const primeiro = indice === 0;
      return `
        <g transform="translate(0, ${y})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaSlot}" fill="${primeiro ? "#252c4a" : "#20263f"}" rx="16"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaSlot}" fill="none" stroke="${OURO}" stroke-width="${primeiro ? 2 : 1}" opacity="${primeiro ? 0.5 : 0.14}" rx="16"/>
          <circle cx="${MARGEM + 40}" cy="${alturaSlot / 2}" r="20" fill="${OURO}" opacity="0.14"/>
          <text x="${MARGEM + 40}" y="${alturaSlot / 2 + 7}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="19" font-weight="900" text-anchor="middle">${indice + 1}</text>
          <text x="${MARGEM + 76}" y="${alturaSlot / 2 - 4}" fill="#ffffff" font-family="${FONTE_TITULO}" font-size="21" font-weight="900">${escapar(`${slot.dia} · ${slot.hora}`)}</text>
          <text x="${MARGEM + 76}" y="${alturaSlot / 2 + 20}" fill="#8f96b8" font-family="${FONTE}" font-size="14">${escapar(slot.nota ? `${slot.data} · ${slot.nota}` : slot.data)}</text>
          ${primeiro ? `<text x="${MARGEM + largura - 24}" y="${alturaSlot / 2 + 6}" fill="${OURO}" font-family="${FONTE}" font-size="13" font-weight="bold" text-anchor="end">MAIS CEDO</text>` : ""}
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg width="${LARGURA}" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${alturaTotal}">
      ${FUNDO}
      ${logo}
      <text x="${LARGURA / 2}" y="${topo + 22}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="21" font-weight="900" text-anchor="middle">HORÁRIOS LIVRES</text>
      <text x="${LARGURA / 2}" y="${topo + 44}" fill="#8f96b8" font-family="${FONTE}" font-size="15" text-anchor="middle">${escapar(`${data.service} · ${data.duracao} reservadas para o ${data.vehicle}`)}</text>
      ${blocos}
      <text x="${LARGURA / 2}" y="${alturaTotal - MARGEM - 6}" fill="#888888" font-family="${FONTE}" font-size="14" text-anchor="middle">Prefere outro dia? É só escrever a data.</text>
    </svg>
  `;

  return publicar(svg, "horarios", data.service);
}

/**
 * Ticket da reserva: o comprovante que o cliente guarda.
 *
 * A confirmação era uma lista de campos em texto. Um ticket com a placa em
 * destaque serve para alguma coisa: é o que a pessoa mostra na chegada e o que
 * a câmera do portão usa para reconhecer o carro.
 */
export async function generateTicketCard(data: {
  code: string;
  name: string;
  vehicle: string;
  plate: string;
  service: string;
  date: string;
  time: string;
  price: string;
  address: string;
}): Promise<string | null> {
  const alturaLogo = 44;
  const topo = MARGEM + alturaLogo + 10;
  const alturaCorpo = 300;
  const enderecoLinhas = quebrar(data.address, 46).slice(0, 2);
  const alturaTotal = topo + alturaCorpo + enderecoLinhas.length * 20 + 44 + MARGEM;
  const logo = await renderLogo((LARGURA - 62) / 2, MARGEM, 62, alturaLogo);
  const largura = LARGURA - MARGEM * 2;

  const linha = (rotulo: string, valor: string, y: number, x: number, ancora: "start" | "end" = "start") => `
    <text x="${x}" y="${y}" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="13" font-weight="500" text-anchor="${ancora}">${escapar(rotulo)}</text>
    <text x="${x}" y="${y + 24}" fill="#ffffff" font-family="${FONTE}" font-size="19" text-anchor="${ancora}">${escapar(valor)}</text>
  `;

  const svg = `
    <svg width="${LARGURA}" height="${alturaTotal}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${alturaTotal}">
      ${FUNDO}
      ${logo}
      <g transform="translate(0, ${topo})">
        <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaCorpo}" fill="#20263f" rx="18"/>
        <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaCorpo}" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.2" rx="18"/>

        <text x="${MARGEM + 26}" y="34" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="19" font-weight="900">RESERVA CONFIRMADA</text>
        <text x="${MARGEM + largura - 26}" y="34" fill="#8f96b8" font-family="${FONTE}" font-size="14" text-anchor="end">${escapar(data.code)}</text>

        <rect x="${MARGEM + 26}" y="52" width="${largura - 52}" height="1" fill="url(#divisor)"/>

        <text x="${MARGEM + 26}" y="88" fill="#ffffff" font-family="${FONTE_TITULO}" font-size="24" font-weight="900">${escapar(data.service)}</text>

        ${linha("QUANDO", `${data.date} · ${data.time}`, 126, MARGEM + 26)}
        ${linha("VALOR", data.price, 126, MARGEM + largura - 26, "end")}
        ${linha("CLIENTE", data.name, 190, MARGEM + 26)}
        ${linha("VEÍCULO", data.vehicle, 190, MARGEM + largura - 26, "end")}

        <rect x="${MARGEM + 26}" y="220" width="${largura - 52}" height="56" fill="${OURO}" opacity="0.12" rx="12"/>
        <text x="${MARGEM + 46}" y="243" fill="${OURO_SUAVE}" font-family="${FONTE}" font-size="13" font-weight="500">PLACA — a câmera reconhece na chegada</text>
        <text x="${MARGEM + 46}" y="268" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="24" font-weight="900" letter-spacing="3">${escapar(data.plate || "informe no dia")}</text>
      </g>
      ${enderecoLinhas
        .map(
          (l, i) =>
            `<text x="${LARGURA / 2}" y="${topo + alturaCorpo + 28 + i * 20}" fill="#8f96b8" font-family="${FONTE}" font-size="14" text-anchor="middle">${escapar(l)}</text>`
        )
        .join("")}
    </svg>
  `;

  return publicar(svg, "ticket", data.code);
}
