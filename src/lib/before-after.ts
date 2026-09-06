/**
 * Montagem "antes e depois" a partir das duas fotos que a câmera do portão já
 * captura: o snapshot da entrada (ENTER) e o da saída (EXIT).
 *
 * O material serve a dois destinos diferentes e por isso é gerado em dois
 * formatos: uma peça única 1080×1080 enviada ao cliente no WhatsApp, e o par de
 * imagens normalizadas guardado como `InstagramStoryAsset` do tipo
 * `before_after`, que o rodízio de Stories já sabe diagramar sozinho.
 *
 * Privacidade: a foto do portão mostra a placa do veículo. Por isso a peça do
 * cliente é sempre privada e a publicação no Instagram é opt-in
 * (`Settings.beforeAfterInstagram`, desligada por padrão) e nunca leva nome,
 * telefone ou placa no texto.
 */

import sharp from "sharp";
import { randomBytes } from "node:crypto";
import type { Appointment, Client, Service } from "@prisma/client";
import { prisma } from "./prisma";
import { uploadImageToCloudinary } from "./image-upload";
import { getEmbeddedSvgFontCss, SVG_FONT_FAMILY } from "./svg-font";

type AptWithRelations = Appointment & { client: Client; service: Service };

export const BEFORE_AFTER_SIZE = 1080;
/** Formato guardado como material de Story: mantém margem para o corte 9:16. */
export const STORY_PANEL_WIDTH = 1080;
export const STORY_PANEL_HEIGHT = 720;

const MAX_SOURCE_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export type BeforeAfterLayout = {
  size: number;
  headerHeight: number;
  panelHeight: number;
  gap: number;
  footerHeight: number;
  beforeTop: number;
  afterTop: number;
};

/**
 * Geometria da peça 1080×1080. Isolada como função pura para que o
 * enquadramento continue somando exatamente a altura do quadro conforme os
 * valores forem ajustados.
 */
export function beforeAfterLayout(size = BEFORE_AFTER_SIZE): BeforeAfterLayout {
  const headerHeight = Math.round(size * 0.1222);
  const gap = Math.round(size * 0.0074);
  const footerHeight = Math.round(size * 0.0111);
  const panelHeight = Math.floor((size - headerHeight - gap - footerHeight) / 2);
  return {
    size,
    headerHeight,
    panelHeight,
    gap,
    // A sobra da divisão inteira vai para o rodapé, garantindo o fechamento exato.
    footerHeight: size - headerHeight - gap - panelHeight * 2,
    beforeTop: headerHeight,
    afterTop: headerHeight + panelHeight + gap,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Corta o texto do cabeçalho para não estourar a largura da peça. O limite vem
 * da medição real: a 45px de corpo, ~34 caracteres ocupam a área útil de 982px.
 */
export function fitHeadline(text: string, maxChars = 34): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      console.warn("[AntesDepois] Falha ao baixar imagem:", url, response.status);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) return null;
    return buffer;
  } catch (error) {
    console.warn("[AntesDepois] Erro ao baixar imagem:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function overlaySvg(layout: BeforeAfterLayout, opts: { brand: string; headline: string; accent: string }) {
  const { size, headerHeight, panelHeight, beforeTop, afterTop } = layout;
  const badge = (top: number, label: string, fill: string, textFill: string) => {
    const badgeW = Math.round(size * 0.2);
    const badgeH = Math.round(size * 0.055);
    const x = Math.round(size * 0.032);
    const y = top + panelHeight - badgeH - Math.round(size * 0.032);
    return [
      `<rect x="${x}" y="${y}" width="${badgeW}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${fill}" />`,
      `<text x="${x + badgeW / 2}" y="${y + badgeH * 0.68}" fill="${textFill}" font-size="${Math.round(size * 0.03)}" font-weight="800" letter-spacing="2" text-anchor="middle">${label}</text>`,
    ].join("");
  };

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`,
    getEmbeddedSvgFontCss(),
    `<style>text { font-family: '${SVG_FONT_FAMILY}', sans-serif; }</style>`,
    `<rect x="0" y="0" width="${size}" height="${headerHeight}" fill="#0B0B0D" />`,
    // Marca e chapéu dividem a primeira linha; o título fica com a largura
    // inteira embaixo, para que um nome de serviço longo não bata na marca.
    `<text x="${Math.round(size * 0.045)}" y="${Math.round(headerHeight * 0.42)}" fill="${escapeXml(opts.accent)}" font-size="${Math.round(size * 0.026)}" font-weight="700" letter-spacing="6">ANTES &amp; DEPOIS</text>`,
    `<text x="${size - Math.round(size * 0.045)}" y="${Math.round(headerHeight * 0.42)}" fill="#8A8A93" font-size="${Math.round(size * 0.026)}" text-anchor="end">${escapeXml(opts.brand)}</text>`,
    `<text x="${Math.round(size * 0.045)}" y="${Math.round(headerHeight * 0.86)}" fill="#FFFFFF" font-size="${Math.round(size * 0.042)}" font-weight="800">${escapeXml(opts.headline)}</text>`,
    badge(beforeTop, "ANTES", "rgba(11,11,13,0.82)", "#FFFFFF"),
    badge(afterTop, "DEPOIS", escapeXml(opts.accent), "#0B0B0D"),
    `</svg>`,
  ].join("\n");

  return Buffer.from(svg);
}

/** Normaliza uma foto do portão para um painel de largura fixa. */
export async function normalizePanel(source: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 86 })
    .toBuffer();
}

export async function composeBeforeAfterJpeg(opts: {
  before: Buffer;
  after: Buffer;
  brand: string;
  headline: string;
  accent?: string;
}): Promise<Buffer> {
  const layout = beforeAfterLayout();
  const accent = opts.accent || "#D4AF37";
  const [beforePanel, afterPanel] = await Promise.all([
    normalizePanel(opts.before, layout.size, layout.panelHeight),
    normalizePanel(opts.after, layout.size, layout.panelHeight),
  ]);

  return sharp({
    create: {
      width: layout.size,
      height: layout.size,
      channels: 3,
      background: { r: 11, g: 11, b: 13 },
    },
  })
    .composite([
      { input: beforePanel, top: layout.beforeTop, left: 0 },
      { input: afterPanel, top: layout.afterTop, left: 0 },
      { input: overlaySvg(layout, { brand: opts.brand, headline: opts.headline, accent }), top: 0, left: 0 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function brandInfo() {
  const [settings, brand] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.brand.findUnique({ where: { id: "default" } }).catch(() => null),
  ]);
  return {
    settings,
    businessName: brand?.displayName || settings?.businessName || "Garagem do Ka",
    accent: brand?.themeColor || "#D4AF37",
  };
}

/**
 * Guarda o par como material de Story. Não recebe nome nem placa: o rodízio do
 * Instagram é público e o texto precisa ser genérico.
 */
async function saveStoryAsset(opts: {
  beforeUrl: string;
  afterUrl: string;
  before: Buffer;
  after: Buffer;
  title: string;
  caption: string;
}) {
  const [beforeStory, afterStory] = await Promise.all([
    normalizePanel(opts.before, STORY_PANEL_WIDTH, STORY_PANEL_HEIGHT),
    normalizePanel(opts.after, STORY_PANEL_WIDTH, STORY_PANEL_HEIGHT),
  ]);
  const asset = await prisma.instagramStoryAsset.create({
    data: {
      type: "before_after",
      category: "antes_depois",
      title: opts.title,
      caption: opts.caption,
      imageUrl: opts.beforeUrl,
      imageUrlAfter: opts.afterUrl,
      imageData: Uint8Array.from(beforeStory),
      imageDataAfter: Uint8Array.from(afterStory),
      imageMime: "image/jpeg",
      imageMimeAfter: "image/jpeg",
      publicToken: randomBytes(24).toString("base64url"),
      active: true,
    },
    select: { id: true },
  });
  return asset.id;
}

export type BeforeAfterSkipReason = "disabled" | "missing-source" | "download-failed" | "upload-failed" | "error";

export type BeforeAfterResult = {
  composedUrl: string | null;
  assetId: string | null;
  skipped?: BeforeAfterSkipReason;
};

/**
 * Monta a peça do atendimento e a persiste. Nunca lança: uma falha aqui não
 * pode derrubar o processamento do evento de saída do portão.
 */
export async function buildAppointmentBeforeAfter(opts: {
  appointment: AptWithRelations;
  beforeUrl?: string | null;
  afterUrl?: string | null;
}): Promise<BeforeAfterResult> {
  const { appointment, beforeUrl, afterUrl } = opts;
  if (!beforeUrl || !afterUrl) return { composedUrl: null, assetId: null, skipped: "missing-source" };

  try {
    const { settings, businessName, accent } = await brandInfo();
    if (settings && !settings.beforeAfterEnabled) {
      return { composedUrl: null, assetId: null, skipped: "disabled" };
    }

    const [before, after] = await Promise.all([fetchImageBuffer(beforeUrl), fetchImageBuffer(afterUrl)]);
    if (!before || !after) return { composedUrl: null, assetId: null, skipped: "download-failed" };

    const vehicle = appointment.client.vehicleModel?.trim() || "Seu veículo";
    const composed = await composeBeforeAfterJpeg({
      before,
      after,
      brand: businessName,
      headline: fitHeadline(`${vehicle} · ${appointment.service.name}`),
      accent,
    });

    const upload = await uploadImageToCloudinary(
      composed,
      `antes-depois-${appointment.id}.jpg`,
      "gate-vision/antes-depois"
    );
    if (!upload.success || !upload.url) {
      return { composedUrl: null, assetId: null, skipped: "upload-failed" };
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { beforeAfterUrl: upload.url },
    });

    let assetId: string | null = null;
    if (settings?.beforeAfterInstagram) {
      assetId = await saveStoryAsset({
        beforeUrl,
        afterUrl,
        before,
        after,
        title: appointment.service.name,
        caption: "Resultado real do atendimento de hoje",
      });
    }

    return { composedUrl: upload.url, assetId };
  } catch (error) {
    console.error("[AntesDepois] Falha ao montar a peça:", error);
    return { composedUrl: null, assetId: null, skipped: "error" };
  }
}
