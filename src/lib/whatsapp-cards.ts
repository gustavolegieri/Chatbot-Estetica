/**
 * Cartões visuais do atendimento no WhatsApp.
 *
 * Cada etapa que pede uma decisão do cliente tem um cartão: a abertura, o
 * catálogo, o serviço escolhido, a proposta, os complementos, os horários e o
 * ticket da reserva. Todos saem da mesma moldura — preto, dourado e a logo no
 * topo — para que a conversa inteira pareça a mesma marca, e não uma colagem de
 * mensagens de origens diferentes.
 *
 * Regras que valem para todos: altura calculada antes de desenhar (nada de
 * elemento sobrepondo outro), texto sempre com escape, nenhum `<svg>` aninhado
 * e conversão pelo mesmo `convertSvgToPng` do calendário — é ele que carrega as
 * fontes do repositório, sem depender de fonte de sistema.
 */
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { renderLogo } from "./svg-utils";
import { uploadImageToCloudinary } from "./image-upload";
import { convertSvgToPng } from "./calendar-converter";

const LARGURA = 620;
const MARGEM = 26;

/** Preto do fundo, ouro da marca e os cinzas de apoio. */
const PRETO = "#050506";
const PRETO_CLARO = "#0e0e12";
const CARTAO = "#131318";
const CARTAO_DESTAQUE = "#1c1a17";
const BORDA = "#2a2a31";
const OURO = "#f0c14b";
const OURO_FORTE = "#ffd76a";
const TEXTO = "#f5f5f7";
const TEXTO_FRACO = "#8b8b98";

// Os nomes são os das famílias reais empacotadas em public/fonts: o resvg
// resolve a fonte pelo nome, não pelo @font-face embutido no SVG.
const FONTE = "Noto Sans, sans-serif";
const FONTE_TITULO = "Montserrat, Noto Sans, sans-serif";

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

/** "90 min" fica "1h30"; 480 min ou mais viram "1 dia". */
export function duracaoLegivel(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  if (minutos >= 480) return "1 dia";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
}

const DEFS = `
  <defs>
    <linearGradient id="fundo" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${PRETO_CLARO}" />
      <stop offset="55%" style="stop-color:${PRETO}" />
      <stop offset="100%" style="stop-color:#08080b" />
    </linearGradient>
    <linearGradient id="fio" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${OURO};stop-opacity:0" />
      <stop offset="50%" style="stop-color:${OURO};stop-opacity:0.65" />
      <stop offset="100%" style="stop-color:${OURO};stop-opacity:0" />
    </linearGradient>
    <linearGradient id="barra" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#8a6a1f" />
      <stop offset="50%" style="stop-color:${OURO_FORTE}" />
      <stop offset="100%" style="stop-color:#8a6a1f" />
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:${OURO};stop-opacity:0.16" />
      <stop offset="100%" style="stop-color:${OURO};stop-opacity:0" />
    </radialGradient>
  </defs>
`;

/**
 * Cabeçalho comum: barra dourada, logo com halo, título e subtítulo.
 * Devolve o SVG e o Y onde o conteúdo do cartão pode começar.
 */
async function cabecalho(titulo: string, subtitulo?: string) {
  const alturaLogo = 62;
  const yLogo = MARGEM + 10;
  const logo = await renderLogo((LARGURA - 88) / 2, yLogo, 88, alturaLogo);
  const yTitulo = yLogo + alturaLogo + 42;
  const ySub = subtitulo ? yTitulo + 26 : yTitulo;
  const yFio = ySub + 18;

  const svg = `
    <rect x="0" y="0" width="${LARGURA}" height="5" fill="url(#barra)"/>
    <circle cx="${LARGURA / 2}" cy="${yLogo + alturaLogo / 2}" r="92" fill="url(#halo)"/>
    ${logo}
    <text x="${LARGURA / 2}" y="${yTitulo}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="25" font-weight="900" letter-spacing="1.5" text-anchor="middle">${escapar(titulo.toUpperCase())}</text>
    ${
      subtitulo
        ? `<text x="${LARGURA / 2}" y="${ySub + 4}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="15" text-anchor="middle">${escapar(subtitulo)}</text>`
        : ""
    }
    <rect x="${MARGEM}" y="${yFio}" width="${LARGURA - MARGEM * 2}" height="1" fill="url(#fio)"/>
  `;

  return { svg, conteudoY: yFio + 24 };
}

/** Rodapé com a assinatura da marca ou a instrução da etapa. */
function rodape(y: number, texto: string) {
  return `
    <rect x="${MARGEM}" y="${y}" width="${LARGURA - MARGEM * 2}" height="1" fill="url(#fio)"/>
    <text x="${LARGURA / 2}" y="${y + 26}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="13" letter-spacing="0.6" text-anchor="middle">${escapar(texto)}</text>
  `;
}

function moldura(altura: number, conteudo: string) {
  return `
    <svg width="${LARGURA}" height="${altura}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${altura}">
      ${DEFS}
      <rect width="100%" height="100%" fill="url(#fundo)"/>
      ${conteudo}
    </svg>
  `;
}

/** Cache do processo, para duas mensagens seguidas na mesma instância. */
const cacheEmMemoria = new Map<string, string>();

/**
 * Publica o cartão, reaproveitando o que já foi renderizado.
 *
 * A capa da marca e a tabela de serviços têm o mesmo SVG em todo atendimento, e
 * os dois passos caros são justamente os finais: converter para PNG e subir. O
 * endereço é o conteúdo — mesmo SVG, mesma URL —, então o cache não precisa de
 * invalidação: mudou o preço, muda o SVG, muda o hash.
 */
async function publicar(svg: string, prefixo: string, alternativo: string): Promise<string | null> {
  const hash = createHash("sha256").update(svg).digest("hex");

  const daMemoria = cacheEmMemoria.get(hash);
  if (daMemoria) return daMemoria;

  try {
    const salvo = await prisma.cardCache.findUnique({ where: { hash }, select: { url: true } });
    if (salvo?.url) {
      cacheEmMemoria.set(hash, salvo.url);
      return salvo.url;
    }
  } catch (erro) {
    // Cache indisponível não pode derrubar o atendimento: segue e renderiza.
    console.warn("[Cartões] Cache indisponível, renderizando de novo:", erro);
  }

  try {
    const conversao = await convertSvgToPng(svg, { width: 930 });
    if (!conversao.success || !conversao.pngBuffer) throw new Error(conversao.error ?? "conversão falhou");
    const upload = await uploadImageToCloudinary(conversao.pngBuffer, `${prefixo}-${Date.now()}`, "cards");
    if (upload.success && upload.url) {
      cacheEmMemoria.set(hash, upload.url);
      await prisma.cardCache
        .create({ data: { hash, url: upload.url, kind: prefixo } })
        .catch(() => undefined); // corrida entre instâncias: a primeira grava
      return upload.url;
    }
    console.error(`[Cartões] Upload de ${prefixo} falhou:`, upload.error);
  } catch (erro) {
    console.error(`[Cartões] Não foi possível gerar ${prefixo}:`, erro);
  }
  // Sem imagem o atendimento continua: quem chama envia só o texto.
  console.warn(`[Cartões] Seguindo sem imagem em ${prefixo} (${alternativo}).`);
  return null;
}

// ─────────────────────────────────────────────────────────────
// 1 — CAPA DA MARCA
// ─────────────────────────────────────────────────────────────

export interface WelcomeCardData {
  businessName: string;
  tagline: string;
  destaques: string[];
  address: string;
  hours: string;
}

export async function generateWelcomeCard(data: WelcomeCardData): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho(data.businessName, data.tagline);
  const destaques = data.destaques.slice(0, 5);
  const linha = 40;
  const alturaLista = destaques.length * linha;
  const enderecoLinhas = quebrar(data.address, 44);
  const alturaRodape = 40 + enderecoLinhas.length * 22 + 26;
  const alturaTotal = conteudoY + alturaLista + alturaRodape + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  const itens = destaques
    .map((item, indice) => {
      const y = conteudoY + indice * linha;
      return `
        <rect x="${MARGEM}" y="${y}" width="${largura}" height="32" fill="${CARTAO}" rx="9"/>
        <rect x="${MARGEM}" y="${y}" width="3" height="32" fill="${OURO}" opacity="0.85" rx="2"/>
        <text x="${MARGEM + 22}" y="${y + 22}" fill="${TEXTO}" font-family="${FONTE}" font-size="18">${escapar(item)}</text>
      `;
    })
    .join("");

  const yRodape = conteudoY + alturaLista + 16;
  const endereco = enderecoLinhas
    .map(
      (l, i) =>
        `<text x="${LARGURA / 2}" y="${yRodape + 30 + i * 22}" fill="${OURO}" font-family="${FONTE}" font-size="15" text-anchor="middle">${escapar(l)}</text>`
    )
    .join("");

  return publicar(
    moldura(
      alturaTotal,
      `${topo}
       ${itens}
       <rect x="${MARGEM}" y="${yRodape}" width="${largura}" height="1" fill="url(#fio)"/>
       ${endereco}
       <text x="${LARGURA / 2}" y="${yRodape + 34 + enderecoLinhas.length * 22}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="14" text-anchor="middle">${escapar(data.hours)}</text>`
    ),
    "boas-vindas",
    data.businessName
  );
}

// ─────────────────────────────────────────────────────────────
// 2 — CATÁLOGO COMPLETO
// ─────────────────────────────────────────────────────────────

export interface CatalogGroup {
  title: string;
  items: Array<{ name: string; price: string; duration?: string }>;
}

/**
 * Tabela de preços inteira, agrupada por categoria.
 *
 * O menu mostra categorias e o submenu mostra os serviços de uma delas: quem
 * quer só saber "quanto custa cada coisa" precisava abrir cinco listas. Este
 * cartão responde à pergunta de uma vez e continua valendo como material que o
 * cliente guarda ou encaminha para alguém.
 */
export async function generateCatalogCard(data: {
  businessName: string;
  groups: CatalogGroup[];
  footer: string;
}): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho("Tabela de serviços", data.businessName);
  const linhaItem = 30;
  const alturaCabecalhoGrupo = 36;
  const grupos = data.groups.filter((grupo) => grupo.items.length).slice(0, 6);

  const alturaDoGrupo = (grupo: CatalogGroup) =>
    alturaCabecalhoGrupo + Math.min(grupo.items.length, 6) * linhaItem + 12;
  const alturaGrupos = grupos.reduce((soma, grupo) => soma + alturaDoGrupo(grupo) + 10, 0);
  const alturaTotal = conteudoY + alturaGrupos + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  let y = conteudoY;
  const blocos = grupos
    .map((grupo) => {
      const itens = grupo.items.slice(0, 6);
      const altura = alturaDoGrupo(grupo);
      const topoBloco = y;
      y += altura + 10;

      const linhas = itens
        .map((item, indice) => {
          const iy = alturaCabecalhoGrupo + 22 + indice * linhaItem;
          const nome = quebrar(item.name, 32)[0] ?? item.name;
          const tempo = item.duration ? ` · ${item.duration}` : "";
          return `
            <circle cx="${MARGEM + 18}" cy="${iy - 5}" r="2.5" fill="${OURO}" opacity="0.7"/>
            <text x="${MARGEM + 32}" y="${iy}" fill="${TEXTO}" font-family="${FONTE}" font-size="16">${escapar(nome)}</text>
            <text x="${MARGEM + largura - 20}" y="${iy}" fill="${OURO_FORTE}" font-family="${FONTE}" font-size="16" font-weight="bold" text-anchor="end">${escapar(`${item.price}${tempo}`)}</text>
          `;
        })
        .join("");

      return `
        <g transform="translate(0, ${topoBloco})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="${CARTAO}" rx="13"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="none" stroke="${BORDA}" stroke-width="1" rx="13"/>
          <rect x="${MARGEM}" y="0" width="4" height="${altura}" fill="${OURO}" opacity="0.5" rx="2"/>
          <text x="${MARGEM + 20}" y="${alturaCabecalhoGrupo - 12}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="14" font-weight="900" letter-spacing="1.4">${escapar(grupo.title.toUpperCase())}</text>
          ${linhas}
        </g>
      `;
    })
    .join("");

  return publicar(
    moldura(alturaTotal, `${topo}${blocos}${rodape(conteudoY + alturaGrupos, data.footer)}`),
    "catalogo",
    data.businessName
  );
}

// ─────────────────────────────────────────────────────────────
// 3 — SERVIÇO ESCOLHIDO
// ─────────────────────────────────────────────────────────────

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

export async function generateServiceCard(data: ServiceCardData): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho(data.name, data.pitch || undefined);
  const linhaItem = 30;
  // O ✓ marca o item, não a linha: uma frase que quebra em duas continua sendo
  // um item só, e a segunda linha entra recuada, sem marcador próprio.
  const itens = data.includes.slice(0, 8).flatMap((item) =>
    quebrar(item, 44)
      .slice(0, 2)
      .map((texto, indice) => ({ texto, primeira: indice === 0 }))
  );

  const alturaFaixa = 84;
  const alturaLista = 26 + itens.length * linhaItem + 14;
  const alturaTotal = conteudoY + alturaFaixa + 18 + alturaLista + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  const itensSvg = itens
    .map((item, indice) => {
      const y = 38 + indice * linhaItem;
      const marcador = item.primeira
        ? `<path d="M ${MARGEM + 22} ${y - 9} l 5 6 l 10 -13" stroke="${OURO}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        : "";
      return `${marcador}
        <text x="${MARGEM + 48}" y="${y}" fill="${TEXTO}" font-family="${FONTE}" font-size="17">${escapar(item.texto)}</text>`;
    })
    .join("");

  const yLista = conteudoY + alturaFaixa + 18;

  return publicar(
    moldura(
      alturaTotal,
      `${topo}
       <g transform="translate(0, ${conteudoY})">
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaFaixa}" fill="${CARTAO_DESTAQUE}" rx="14"/>
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaFaixa}" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.35" rx="14"/>
         <text x="${MARGEM + 30}" y="32" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="13" letter-spacing="1.2">INVESTIMENTO</text>
         <text x="${MARGEM + 30}" y="66" fill="${OURO_FORTE}" font-family="${FONTE_TITULO}" font-size="30" font-weight="900">${escapar(data.price)}</text>
         <text x="${MARGEM + largura - 30}" y="32" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="13" letter-spacing="1.2" text-anchor="end">DURAÇÃO</text>
         <text x="${MARGEM + largura - 30}" y="66" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="26" font-weight="900" text-anchor="end">${escapar(data.duration)}</text>
       </g>
       <g transform="translate(0, ${yLista})">
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaLista}" fill="${CARTAO}" rx="14"/>
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaLista}" fill="none" stroke="${BORDA}" stroke-width="1" rx="14"/>
         ${itensSvg}
       </g>
       ${rodape(yLista + alturaLista + 14, "Garagem do Ka · estética automotiva")}`
    ),
    "servico",
    data.name
  );
}

// ─────────────────────────────────────────────────────────────
// 4 — PROPOSTA EM DEGRAUS
// ─────────────────────────────────────────────────────────────

export interface ProposalOption {
  tier: string;
  name: string;
  price: string;
  duration: string;
  bullets: string[];
  recommended?: boolean;
}

export async function generateProposalCard(data: {
  vehicle: string;
  problema: string;
  options: ProposalOption[];
}): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho(
    "Sua proposta",
    `${data.vehicle}${data.problema ? ` · ${quebrar(data.problema, 34)[0]}` : ""}`
  );
  const linhaBullet = 25;
  const opcoes = data.options.slice(0, 3);
  const alturas = opcoes.map((opcao) => 96 + Math.min(opcao.bullets.length, 3) * linhaBullet);
  const alturaTotal =
    conteudoY + alturas.reduce((soma, altura) => soma + altura + 14, 0) + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  let y = conteudoY;
  const blocos = opcoes
    .map((opcao, indice) => {
      const altura = alturas[indice];
      const topoBloco = y;
      y += altura + 14;
      const destaque = opcao.recommended;

      const bullets = opcao.bullets
        .slice(0, 3)
        .map((bullet, i) => {
          const by = 88 + i * linhaBullet;
          return `
            <circle cx="${MARGEM + 32}" cy="${by - 5}" r="3" fill="${OURO}" opacity="0.8"/>
            <text x="${MARGEM + 46}" y="${by}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="15">${escapar(quebrar(bullet, 40)[0] ?? bullet)}</text>
          `;
        })
        .join("");

      return `
        <g transform="translate(0, ${topoBloco})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="${destaque ? CARTAO_DESTAQUE : CARTAO}" rx="14"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${altura}" fill="none" stroke="${destaque ? OURO : BORDA}" stroke-width="${destaque ? 2 : 1}" opacity="${destaque ? 0.7 : 1}" rx="14"/>
          <rect x="${MARGEM}" y="16" width="4" height="${altura - 32}" fill="${OURO}" opacity="${destaque ? 1 : 0.4}" rx="2"/>
          ${destaque ? `<rect x="${MARGEM + largura - 150}" y="14" width="130" height="24" fill="${OURO}" rx="12"/><text x="${MARGEM + largura - 85}" y="31" fill="#111114" font-family="${FONTE_TITULO}" font-size="12" font-weight="900" letter-spacing="1" text-anchor="middle">RECOMENDADO</text>` : ""}
          <text x="${MARGEM + 32}" y="34" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="12" letter-spacing="1.4">${escapar(`OPÇÃO ${indice + 1} · ${opcao.tier.toUpperCase()}`)}</text>
          <text x="${MARGEM + 32}" y="62" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="20" font-weight="900">${escapar(quebrar(opcao.name, 28)[0] ?? opcao.name)}</text>
          <text x="${MARGEM + largura - 30}" y="${destaque ? 66 : 62}" fill="${OURO_FORTE}" font-family="${FONTE_TITULO}" font-size="26" font-weight="900" text-anchor="end">${escapar(opcao.price)}</text>
          <text x="${MARGEM + largura - 30}" y="${destaque ? 86 : 82}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="14" text-anchor="end">${escapar(opcao.duration)}</text>
          ${bullets}
        </g>
      `;
    })
    .join("");

  return publicar(
    moldura(alturaTotal, `${topo}${blocos}${rodape(y - 2, "Responda com o número da opção")}`),
    "proposta",
    data.vehicle
  );
}

// ─────────────────────────────────────────────────────────────
// 5 — COMPLEMENTOS DA VISITA
// ─────────────────────────────────────────────────────────────

/**
 * Adicionais que cabem na mesma visita.
 *
 * São serviços que ninguém procura sozinho — não se abre uma conversa pedindo
 * cristalização de faróis —, mas que fazem sentido quando o carro já vai ficar
 * na oficina. Em um cartão próprio, com preço e o motivo de cada um, a escolha
 * é informada em vez de empurrada.
 */
export async function generateExtrasCard(data: {
  service: string;
  extras: Array<{ name: string; price: string; duration?: string; motivo: string }>;
}): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho("Aproveite a visita", data.service);
  const extras = data.extras.slice(0, 5);
  const alturaItem = 78;
  const alturaTotal = conteudoY + extras.length * (alturaItem + 12) + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  const blocos = extras
    .map((extra, indice) => {
      const topoBloco = conteudoY + indice * (alturaItem + 12);
      return `
        <g transform="translate(0, ${topoBloco})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaItem}" fill="${CARTAO}" rx="14"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaItem}" fill="none" stroke="${BORDA}" stroke-width="1" rx="14"/>
          <circle cx="${MARGEM + 36}" cy="${alturaItem / 2}" r="19" fill="${OURO}" opacity="0.13"/>
          <text x="${MARGEM + 36}" y="${alturaItem / 2 + 6}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="17" font-weight="900" text-anchor="middle">${indice + 1}</text>
          <text x="${MARGEM + 70}" y="${alturaItem / 2 - 6}" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="18" font-weight="900">${escapar(quebrar(extra.name, 26)[0] ?? extra.name)}</text>
          <text x="${MARGEM + 70}" y="${alturaItem / 2 + 18}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="14">${escapar(quebrar(extra.motivo, 38)[0] ?? "")}</text>
          <text x="${MARGEM + largura - 26}" y="${alturaItem / 2 - 2}" fill="${OURO_FORTE}" font-family="${FONTE_TITULO}" font-size="21" font-weight="900" text-anchor="end">${escapar(extra.price)}</text>
          ${extra.duration ? `<text x="${MARGEM + largura - 26}" y="${alturaItem / 2 + 20}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="13" text-anchor="end">+${escapar(extra.duration)}</text>` : ""}
        </g>
      `;
    })
    .join("");

  return publicar(
    moldura(
      alturaTotal,
      `${topo}${blocos}${rodape(conteudoY + extras.length * (alturaItem + 12) - 2, "Responda os números que quiser — ou pule")}`
    ),
    "extras",
    data.service
  );
}

// ─────────────────────────────────────────────────────────────
// 6 — HORÁRIOS
// ─────────────────────────────────────────────────────────────

export interface SlotOption {
  dia: string;
  data: string;
  hora: string;
  nota?: string;
}

export async function generateSlotsCard(data: {
  service: string;
  vehicle: string;
  duracao: string;
  slots: SlotOption[];
}): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho(
    "Horários livres",
    `${data.service} · ${data.duracao} para o ${data.vehicle}`
  );
  const slots = data.slots.slice(0, 3);
  const alturaSlot = 84;
  const alturaTotal = conteudoY + slots.length * (alturaSlot + 12) + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;

  const blocos = slots
    .map((slot, indice) => {
      const y = conteudoY + indice * (alturaSlot + 12);
      const primeiro = indice === 0;
      return `
        <g transform="translate(0, ${y})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaSlot}" fill="${primeiro ? CARTAO_DESTAQUE : CARTAO}" rx="14"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaSlot}" fill="none" stroke="${primeiro ? OURO : BORDA}" stroke-width="${primeiro ? 2 : 1}" opacity="${primeiro ? 0.7 : 1}" rx="14"/>
          <circle cx="${MARGEM + 44}" cy="${alturaSlot / 2}" r="22" fill="${OURO}" opacity="0.14"/>
          <text x="${MARGEM + 44}" y="${alturaSlot / 2 + 8}" fill="${OURO}" font-family="${FONTE_TITULO}" font-size="20" font-weight="900" text-anchor="middle">${indice + 1}</text>
          <text x="${MARGEM + 84}" y="${alturaSlot / 2 - 4}" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="22" font-weight="900">${escapar(`${slot.dia} · ${slot.hora}`)}</text>
          <text x="${MARGEM + 84}" y="${alturaSlot / 2 + 22}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="14">${escapar(slot.nota ? `${slot.data} · ${slot.nota}` : slot.data)}</text>
          ${primeiro ? `<text x="${MARGEM + largura - 26}" y="${alturaSlot / 2 + 6}" fill="${OURO}" font-family="${FONTE}" font-size="12" font-weight="bold" letter-spacing="1" text-anchor="end">MAIS CEDO</text>` : ""}
        </g>
      `;
    })
    .join("");

  return publicar(
    moldura(
      alturaTotal,
      `${topo}${blocos}${rodape(conteudoY + slots.length * (alturaSlot + 12) - 2, "Prefere outro dia? É só escrever a data")}`
    ),
    "horarios",
    data.service
  );
}

// ─────────────────────────────────────────────────────────────
// 7 — TICKET DA RESERVA
// ─────────────────────────────────────────────────────────────

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
  const { svg: topo, conteudoY } = await cabecalho("Reserva confirmada", data.code);
  const largura = LARGURA - MARGEM * 2;
  const alturaCorpo = 272;
  const enderecoLinhas = quebrar(data.address, 46).slice(0, 2);
  const alturaTotal = conteudoY + alturaCorpo + 36 + enderecoLinhas.length * 22 + MARGEM;

  const campo = (rotulo: string, valor: string, y: number, x: number, ancora: "start" | "end") => `
    <text x="${x}" y="${y}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="12" letter-spacing="1.3" text-anchor="${ancora}">${escapar(rotulo)}</text>
    <text x="${x}" y="${y + 25}" fill="${TEXTO}" font-family="${FONTE}" font-size="19" text-anchor="${ancora}">${escapar(valor)}</text>
  `;

  const yRodape = conteudoY + alturaCorpo + 28;

  return publicar(
    moldura(
      alturaTotal,
      `${topo}
       <g transform="translate(0, ${conteudoY})">
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaCorpo}" fill="${CARTAO}" rx="16"/>
         <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaCorpo}" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.4" rx="16"/>
         <text x="${MARGEM + 28}" y="44" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="23" font-weight="900">${escapar(quebrar(data.service, 28)[0] ?? data.service)}</text>
         ${campo("QUANDO", `${data.date} · ${data.time}`, 90, MARGEM + 28, "start")}
         ${campo("VALOR", data.price, 90, MARGEM + largura - 28, "end")}
         ${campo("CLIENTE", data.name, 156, MARGEM + 28, "start")}
         ${campo("VEÍCULO", quebrar(data.vehicle, 20)[0] ?? data.vehicle, 156, MARGEM + largura - 28, "end")}
         <rect x="${MARGEM + 28}" y="192" width="${largura - 56}" height="58" fill="${OURO}" opacity="0.1" rx="12"/>
         <rect x="${MARGEM + 28}" y="192" width="${largura - 56}" height="58" fill="none" stroke="${OURO}" stroke-width="1" opacity="0.3" rx="12"/>
         <text x="${MARGEM + 48}" y="215" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="12" letter-spacing="1.2">PLACA — a câmera reconhece na chegada</text>
         <text x="${MARGEM + 48}" y="240" fill="${OURO_FORTE}" font-family="${FONTE_TITULO}" font-size="24" font-weight="900" letter-spacing="4">${escapar(data.plate || "informe no dia")}</text>
       </g>
       ${enderecoLinhas
         .map(
           (l, i) =>
             `<text x="${LARGURA / 2}" y="${yRodape + i * 22}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="14" text-anchor="middle">${escapar(l)}</text>`
         )
         .join("")}`
    ),
    "ticket",
    data.code
  );
}

/**
 * Agenda dos próximos dias: quantos horários cada um tem e a faixa que cobrem.
 *
 * O cartão anterior mostrava "o primeiro horário livre" de três dias — e, como
 * a agenda abre às 08:00, os três diziam 08:00. Isso escondia justamente a
 * informação que faz escolher: onde sobra espaço e onde já está apertado. Aqui
 * a barra à direita mostra a ocupação de cada dia de relance.
 */
export async function generateAgendaCard(data: {
  service: string;
  vehicle: string;
  duracao: string;
  dias: Array<{ dia: string; data: string; vagas: number; primeiro: string; ultimo: string }>;
}): Promise<string | null> {
  const { svg: topo, conteudoY } = await cabecalho(
    "Agenda aberta",
    `${data.service} · ${data.duracao} para o ${data.vehicle}`
  );
  const dias = data.dias.slice(0, 7);
  const alturaLinha = 56;
  const alturaTotal = conteudoY + dias.length * (alturaLinha + 8) + 52 + MARGEM;
  const largura = LARGURA - MARGEM * 2;
  const maiorVaga = Math.max(...dias.map((d) => d.vagas), 1);

  const linhas = dias
    .map((dia, indice) => {
      const y = conteudoY + indice * (alturaLinha + 8);
      const primeiro = indice === 0;
      // A barra é proporcional ao dia mais livre da lista: comparar dias entre
      // si é o que responde "qual me atende melhor?".
      const larguraBarra = Math.max(18, Math.round((dia.vagas / maiorVaga) * 132));
      return `
        <g transform="translate(0, ${y})">
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaLinha}" fill="${primeiro ? CARTAO_DESTAQUE : CARTAO}" rx="12"/>
          <rect x="${MARGEM}" y="0" width="${largura}" height="${alturaLinha}" fill="none" stroke="${primeiro ? OURO : BORDA}" stroke-width="${primeiro ? 2 : 1}" opacity="${primeiro ? 0.65 : 1}" rx="12"/>
          <text x="${MARGEM + 22}" y="${alturaLinha / 2 - 3}" fill="${TEXTO}" font-family="${FONTE_TITULO}" font-size="18" font-weight="900">${escapar(dia.dia)}</text>
          <text x="${MARGEM + 22}" y="${alturaLinha / 2 + 18}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="13">${escapar(`${dia.data} · ${dia.primeiro} às ${dia.ultimo}`)}</text>
          <rect x="${MARGEM + largura - 176}" y="${alturaLinha / 2 - 7}" width="${larguraBarra}" height="10" fill="${OURO}" opacity="${primeiro ? 0.9 : 0.45}" rx="5"/>
          <text x="${MARGEM + largura - 22}" y="${alturaLinha / 2 + 3}" fill="${primeiro ? OURO_FORTE : TEXTO}" font-family="${FONTE_TITULO}" font-size="16" font-weight="900" text-anchor="end">${dia.vagas}</text>
          <text x="${MARGEM + largura - 22}" y="${alturaLinha / 2 + 20}" fill="${TEXTO_FRACO}" font-family="${FONTE}" font-size="11" text-anchor="end">horários</text>
        </g>
      `;
    })
    .join("");

  return publicar(
    moldura(
      alturaTotal,
      `${topo}${linhas}${rodape(conteudoY + dias.length * (alturaLinha + 8) - 4, "Toque no dia na lista abaixo — ou escreva a data")}`
    ),
    "agenda",
    data.service
  );
}
