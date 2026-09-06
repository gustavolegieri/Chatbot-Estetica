import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import {
  STORY_TOKENS as T,
  STORY_LAYOUTS,
  type StoryLayoutId,
} from "@/lib/instagram-story-tokens";

export const STORY_SLOTS = ["manha", "tarde", "noite"] as const;
export type StorySlot = (typeof STORY_SLOTS)[number];

export function isStorySlot(value: string): value is StorySlot {
  return (STORY_SLOTS as readonly string[]).includes(value);
}

export const STORY_CATEGORIES = [
  "curiosidade",
  "dica",
  "bastidor",
  "enquete",
  "lavagem",
  "polimento",
  "higienizacao",
  "promocao",
  "antes_depois",
  "agenda_vaga",
] as const;
export type StoryCategory = (typeof STORY_CATEGORIES)[number];

/** Compat: layouts antigos mapeiam para bottom | center */
export type StoryLayout = StoryLayoutId | "impact" | "poster" | "split" | "neon" | "band" | "card";

export const STORY_W = T.canvas.width;
export const STORY_H = T.canvas.height;

const BG_POOL = [
  "polimento.jpg",
  "lavagem.jpg",
  "interior.jpg",
  "noite.jpg",
  "ceramic-water-beading.png",
  "dashboard-detailing.png",
  "snow-foam-wash.png",
] as const;
const TEXT_MAX_W = STORY_W - T.marginX * 2;

export type StoryRenderInput = {
  slot: StorySlot;
  brand: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  footer: string;
  accent: string;
  priceLabel?: string | null;
  logoDataUrl?: string | null;
  beforeDataUrl?: string | null;
  afterDataUrl?: string | null;
  bgDataUrl?: string | null;
  bgSeed?: string;
  layout?: StoryLayout;
  showBrandFooter?: boolean;
  /** posição do crop: centre | north | south | east | west */
  cropPosition?: "centre" | "north" | "south" | "east" | "west";
};

let fontFaceCss: string | null = null;
let fontReady: Promise<void> | null = null;

async function ensureFonts() {
  if (fontFaceCss) return;
  if (!fontReady) {
    fontReady = (async () => {
      const dir = path.join(process.cwd(), "public", "fonts");
      const displayFont = path.join(dir, "Montserrat-Black.ttf");
      const bodyFont = path.join(dir, "NotoSans-Regular.ttf");

      const faces: string[] = [];
      try {
        faces.push(
          `@font-face{font-family:'MontserratDisplay';src:url(data:font/ttf;base64,${(await fs.readFile(displayFont)).toString("base64")}) format('truetype');font-weight:900}`
        );
      } catch {
        /* */
      }
      try {
        faces.push(
          `@font-face{font-family:'NotoStory';src:url(data:font/ttf;base64,${(await fs.readFile(bodyFont)).toString("base64")}) format('truetype');font-weight:400 800}`
        );
      } catch {
        /* */
      }
      fontFaceCss = faces.join("");
    })();
  }
  await fontReady;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function wrapText(text: string, maxWidthPx: number, fontSize: number, maxLines = 3): string[] {
  // Montserrat Black é larga; uma estimativa conservadora evita que títulos
  // ultrapassem a área segura na lateral direita do Story.
  const avgChar = fontSize * 0.6;
  const maxChars = Math.max(6, Math.floor(maxWidthPx / avgChar));
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
    }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines.slice(0, maxLines) : [""];
}

export function shortenStoryCopy(title: string, subtitle: string) {
  const t = title.replace(/\s+/g, " ").trim();
  const s = subtitle.replace(/\s+/g, " ").trim();
  return {
    title: t.length > 48 ? `${t.slice(0, 46).trim()}…` : t,
    subtitle: s.length > 56 ? `${s.slice(0, 54).trim()}…` : s,
  };
}

function normalizeLayout(layout?: StoryLayout): StoryLayoutId {
  if (layout === "bottom" || layout === "center" || layout === "upper") return layout;
  // legado → só bottom | center
  if (layout === "card" || layout === "neon") return "center";
  return "bottom";
}

export function layoutForSlot(slot: StorySlot): StoryLayoutId {
  return slot === "noite" ? "center" : "bottom";
}

export function layoutForSeed(seed: string): StoryLayoutId {
  const idx = createHash("sha1").update(seed).digest()[0] % STORY_LAYOUTS.length;
  return STORY_LAYOUTS[idx];
}

function cropForSeed(seed: string): "centre" | "north" | "south" | "east" | "west" {
  const opts = ["centre", "north", "south", "east", "west"] as const;
  return opts[createHash("sha1").update(`crop:${seed}`).digest()[0] % opts.length];
}

function pillWidth(label: string, fontSize: number, padX: number): number {
  return Math.min(TEXT_MAX_W, Math.ceil(label.length * fontSize * 0.66) + padX * 2);
}

/**
 * Spec v2 literal:
 * - foto full-bleed (sem barras/molduras)
 * - 1 gradiente na base
 * - texto esquerda, margem 64px, entre y=1100–1650 (ou centro vertical com mesmo gradiente)
 */
export function buildStoryOverlaySvg(
  content: StoryRenderInput,
  opts?: { fontFaceCss?: string }
): string {
  const layout = normalizeLayout(content.layout ?? layoutForSlot(content.slot));
  const short = shortenStoryCopy(content.title, content.subtitle);
  const brand = T.color.brand;
  const display = T.typography.displayFamily;
  const body = T.typography.bodyFamily;
  const x = T.marginX;

  const titleLines = wrapText(short.title, TEXT_MAX_W, T.typography.title.size, T.typography.title.maxLines);
  const supportLines = short.subtitle
    ? wrapText(short.subtitle, TEXT_MAX_W, T.typography.support.size, T.typography.support.maxLines)
    : [];

  const badgeLabel = content.eyebrow.toUpperCase().slice(0, 24);
  const badgeW = pillWidth(badgeLabel, T.typography.badge.size, 16);
  const badgeH = 36;
  const priceLabel = content.priceLabel?.trim() || null;
  const priceW = priceLabel ? pillWidth(priceLabel, T.typography.price.size, 20) : 0;
  const priceH = 48;

  const titleBlockH = titleLines.length * T.typography.title.lineHeight;
  const supportH = supportLines.length * T.typography.support.lineHeight;
  const stackH =
    badgeH +
    T.space.badgeToTitle +
    titleBlockH +
    (priceLabel ? T.space.titleToPrice + priceH : 0) +
    (supportLines.length ? T.space.priceToSupport + supportH : 0);

  // Layout bottom: começa em contentStart (1100)
  // Layout center: centraliza o bloco na faixa 220–1700, sem sair de contentEnd
  let stackTop: number;
  if (layout === "upper") {
    stackTop = 390;
  } else if (layout === "center") {
    const midZoneTop = T.safe.topEnd;
    const midZoneBottom = T.safe.bottomStart;
    stackTop = Math.round(midZoneTop + (midZoneBottom - midZoneTop - stackH) / 2);
    stackTop = Math.max(T.safe.contentStart - 200, Math.min(stackTop, T.safe.contentEnd - stackH));
  } else {
    stackTop = T.safe.contentStart;
    if (stackTop + stackH > T.safe.contentEnd) {
      stackTop = T.safe.contentEnd - stackH;
    }
  }

  let y = stackTop;
  const badgeY = y;
  y += badgeH + T.space.badgeToTitle;
  const titleY = y + T.typography.title.size * 0.82;
  y += titleBlockH;
  const priceY = priceLabel ? y + T.space.titleToPrice : y;
  if (priceLabel) y = priceY + priceH;
  const supportY = supportLines.length ? y + T.space.priceToSupport + T.typography.support.size : y;

  // Gradiente: em center, começa um pouco acima do bloco; em bottom, spec y=1000
  const gradStartY = layout === "upper" ? 190 : layout === "center" ? Math.max(600, stackTop - 180) : T.gradient.startY;

  const logo = content.logoDataUrl?.startsWith("data:image/")
    ? `<image href="${content.logoDataUrl}" x="${x}" y="250" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const brandX = logo ? x + 112 : x;
  const footer = content.footer.trim();

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="${x}" y="${titleY + i * T.typography.title.lineHeight}"
          fill="${T.color.text}" font-family="${display}" font-size="${T.typography.title.size}"
          letter-spacing="0.5">${escapeXml(line)}</tspan>`
    )
    .join("");

  const supportTspans = supportLines
    .map(
      (line, i) =>
        `<tspan x="${x}" y="${supportY + i * T.typography.support.lineHeight}"
          fill="${T.color.textSupport}" font-family="${body}" font-size="${T.typography.support.size}"
          font-weight="500">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${STORY_W}" height="${STORY_H}" viewBox="0 0 ${STORY_W} ${STORY_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css"><![CDATA[${opts?.fontFaceCss || ""}]]></style>
    <linearGradient id="baseScrim" gradientUnits="userSpaceOnUse"
      x1="0" y1="${gradStartY}" x2="0" y2="${T.gradient.endY}">
      <stop offset="0%" stop-color="#000000" stop-opacity="${T.gradient.startOpacity}"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${T.gradient.endOpacity}"/>
    </linearGradient>
    <filter id="softText" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- ÚNICO overlay sobre a foto: gradiente de legibilidade -->
  <rect x="0" y="${gradStartY}" width="${STORY_W}" height="${STORY_H - gradStartY}" fill="url(#baseScrim)"/>

  <!-- Assinatura discreta da marca -->
  ${logo}
  <text x="${brandX}" y="304" fill="#FFFFFF" font-family="${body}" font-size="25" font-weight="700"
    letter-spacing="1.4" filter="url(#softText)">${escapeXml(content.brand.toUpperCase().slice(0, 30))}</text>

  <!-- 1. Badge -->
  <rect x="${x}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="${T.radius.badge}"
    fill="${T.color.badgeBg}"/>
  <text x="${x + badgeW / 2}" y="${badgeY + 25}" text-anchor="middle"
    fill="${T.color.badgeText}" font-family="${body}" font-size="${T.typography.badge.size}"
    font-weight="700" letter-spacing="${T.typography.badge.tracking}">${escapeXml(badgeLabel)}</text>

  <!-- 2. Título -->
  <text filter="url(#softText)">${titleTspans}</text>

  <!-- 3. Preço (pill marca) -->
  ${
    priceLabel
      ? `<rect x="${x}" y="${priceY}" width="${priceW}" height="${priceH}" rx="${T.radius.price}" fill="${brand}"/>
  <text x="${x + priceW / 2}" y="${priceY + 33}" text-anchor="middle"
    fill="${T.color.onBrand}" font-family="${body}" font-size="${T.typography.price.size}"
    font-weight="700">${escapeXml(priceLabel)}</text>`
      : ""
  }

  <!-- 4. Apoio -->
  ${supportLines.length ? `<text>${supportTspans}</text>` : ""}
  ${
    footer
      ? `<text x="${x}" y="1682" fill="${brand}" font-family="${body}" font-size="22" font-weight="700" letter-spacing="0.8">${escapeXml(footer.toUpperCase().slice(0, 60))}</text>`
      : ""
  }
</svg>`;
}

/** @deprecated */
export function buildStorySvg(content: StoryRenderInput): string {
  return buildStoryOverlaySvg(content);
}

export async function urlToDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", url.replace(/^\//, ""));
      try {
        const buf = await fs.readFile(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase() || "jpg";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        return `data:${mime};base64,${buf.toString("base64")}`;
      } catch {
        /* */
      }
      const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
      const res = await fetch(`${base}${url}`);
      if (!res.ok) return null;
      return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

function pickBgFile(seed: string): string {
  const idx = createHash("sha1").update(seed).digest()[0] % BG_POOL.length;
  return BG_POOL[idx];
}

export async function resolveStoryBackground(input: StoryRenderInput): Promise<Buffer> {
  if (input.bgDataUrl?.startsWith("data:")) {
    const m = input.bgDataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (m) return Buffer.from(m[1], "base64");
  }
  const seed = input.bgSeed || `${input.slot}|${input.title}|${input.eyebrow}`;
  const file = pickBgFile(seed);
  const candidates = [
    path.join(process.cwd(), "public", "story-assets", file),
    path.join(process.cwd(), "public", "tmp", "story-bgs", file),
    path.join(process.cwd(), "public", "tmp", "story-bg-default.jpg"),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p);
    } catch {
      /* */
    }
  }
  return sharp({
    create: { width: STORY_W, height: STORY_H, channels: 3, background: "#111" },
  })
    .jpeg()
    .toBuffer();
}

export async function composeStoryJpeg(input: StoryRenderInput): Promise<Buffer> {
  await ensureFonts();

  const layout = normalizeLayout(input.layout ?? layoutForSlot(input.slot));
  const seed = input.bgSeed || `${input.slot}|${input.title}`;
  const content: StoryRenderInput = {
    ...input,
    layout,
    showBrandFooter: false,
    accent: T.color.brand,
    cropPosition: input.cropPosition ?? cropForSeed(seed),
  };

  const hasBeforeAfter = Boolean(content.beforeDataUrl && content.afterDataUrl);
  let base: Buffer;

  if (hasBeforeAfter) {
    // Antes/depois: duas fotos full-width empilhadas no meio visual — sem faixas laterais
    const dark = await sharp({
      create: { width: STORY_W, height: STORY_H, channels: 3, background: "#0a0a0a" },
    })
      .jpeg()
      .toBuffer();
    const gap = 8;
    const baW = Math.floor((TEXT_MAX_W - gap) / 2);
    const baH = 480;
    const top = 280;
    const toBuf = async (dataUrl: string) => {
      const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!m) throw new Error("img inválida");
      return sharp(Buffer.from(m[1], "base64"))
        .resize(baW, baH, { fit: "cover", position: "centre" })
        .jpeg()
        .toBuffer();
    };
    base = await sharp(dark)
      .composite([
        { input: await toBuf(content.beforeDataUrl!), left: T.marginX, top },
        { input: await toBuf(content.afterDataUrl!), left: T.marginX + baW + gap, top },
      ])
      .jpeg({ quality: T.export.jpegQuality })
      .toBuffer();
  } else {
    const raw = await resolveStoryBackground(content);
    base = await sharp(raw)
      .rotate()
      .resize(STORY_W, STORY_H, {
        fit: "cover",
        position: content.cropPosition || "centre",
      })
      .jpeg({ quality: T.export.jpegQuality })
      .toBuffer();
  }

  const overlaySvg = buildStoryOverlaySvg(content, { fontFaceCss: fontFaceCss || undefined });
  const overlay = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  return sharp(base)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: T.export.jpegQuality, mozjpeg: true })
    .toBuffer();
}

export async function renderStoryDataUrl(input: StoryRenderInput) {
  const jpeg = await composeStoryJpeg(input);
  return { jpeg, imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, content: input };
}

export async function generateAndHostStoryImage(slot: StorySlot) {
  const [settings, brand, service] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.brand.findUnique({ where: { id: "default" } }),
    prisma.service.findFirst({
      where: { active: true, showInWhatsApp: true },
      orderBy: [{ menuOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const businessName = brand?.displayName || settings?.businessName || "Garagem do Ka";
  const serviceName = service?.name ?? "Polimento técnico";
  const price = service ? formatCurrency(Number(service.price)) : "R$ 289";
  const support = service?.whatsappShort || service?.description || "Acabamento premium";

  return renderStoryDataUrl({
    slot,
    brand: businessName,
    footer: "",
    eyebrow: slot === "manha" ? "Lavagem" : slot === "noite" ? "Agenda" : "Polimento",
    title: serviceName,
    subtitle: support.slice(0, 56),
    accent: T.color.brand,
    priceLabel: price,
    bgSeed: `${slot}-${serviceName}`,
    layout: layoutForSlot(slot),
    showBrandFooter: false,
  });
}
