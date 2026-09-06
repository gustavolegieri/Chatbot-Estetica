import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/appointments";
import { formatCurrency } from "@/lib/utils";
import { isInstagramConfigured, publishInstagramStory, fetchStoryInsights } from "@/lib/instagram-publish";
import {
  STORY_SLOTS,
  type StorySlot,
  type StoryCategory,
  type StoryRenderInput,
  composeStoryJpeg,
  urlToDataUrl,
  STORY_CATEGORIES,
  layoutForSlot,
  layoutForSeed,
  shortenStoryCopy,
} from "@/lib/instagram-story";
import { STORY_TOKENS } from "@/lib/instagram-story-tokens";

function finalizeRender(partial: StoryRenderInput, seedExtra = ""): StoryRenderInput {
  const short = shortenStoryCopy(partial.title, partial.subtitle);
  const seed = partial.bgSeed ?? `${partial.slot}|${short.title}|${partial.eyebrow}|${seedExtra}`;
  return {
    ...partial,
    title: short.title,
    subtitle: short.subtitle,
    layout: partial.layout ?? layoutForSeed(seed),
    showBrandFooter: false,
    accent: partial.accent || STORY_TOKENS.color.brand,
    bgSeed: seed,
  };
}

const SP_TZ = "America/Sao_Paulo";

const EDITORIAL_STORIES = [
  { category: "curiosidade", eyebrow: "Você sabia?", title: "O sol também envelhece a pintura", subtitle: "Proteção correta reduz oxidação e perda de brilho.", footer: "Salve esta curiosidade", bg: "ceramic-water-beading" },
  { category: "curiosidade", eyebrow: "Curiosidade", title: "Chuva não lava o carro", subtitle: "Ela carrega minerais que podem marcar a pintura ao secar.", footer: "Compartilhe com quem ama carro", bg: "snow-foam-wash" },
  { category: "curiosidade", eyebrow: "Detalhe técnico", title: "Brilho e proteção não são a mesma coisa", subtitle: "Uma pintura brilhante ainda pode estar sem proteção.", footer: "Conteúdo Garagem do Ka", bg: "ceramic-water-beading" },
  { category: "curiosidade", eyebrow: "Mito ou verdade?", title: "Detergente de cozinha agride a proteção", subtitle: "Verdade. Ele pode remover ceras e ressecar superfícies.", footer: "Salve para não esquecer", bg: "snow-foam-wash" },
  { category: "dica", eyebrow: "Dica rápida", title: "Microfibra limpa evita microrriscos", subtitle: "Pano sujo arrasta partículas sobre a pintura.", footer: "Cuidado que preserva", bg: "polimento" },
  { category: "dica", eyebrow: "Dica de cuidado", title: "Seque o carro sempre à sombra", subtitle: "Isso reduz manchas de água e marcas de secagem.", footer: "Envie para um amigo", bg: "lavagem" },
  { category: "dica", eyebrow: "Interior", title: "Não deixe manchas para depois", subtitle: "Quanto antes tratar, maior a chance de remoção completa.", footer: "Salve esta dica", bg: "dashboard-detailing" },
  { category: "dica", eyebrow: "Pós-lavagem", title: "Evite estacionar sob árvores", subtitle: "Seiva e resíduos de aves podem atacar o verniz.", footer: "Seu carro agradece", bg: "ceramic-water-beading" },
  { category: "bastidor", eyebrow: "Nos bastidores", title: "Cada fresta recebe uma ferramenta certa", subtitle: "Pincéis delicados limpam sem riscar acabamentos.", footer: "Precisão em cada detalhe", bg: "dashboard-detailing" },
  { category: "bastidor", eyebrow: "Processo profissional", title: "A pré-lavagem faz a diferença", subtitle: "Ela solta a sujeira antes do contato com a pintura.", footer: "Menos atrito, mais segurança", bg: "snow-foam-wash" },
  { category: "bastidor", eyebrow: "Cuidado real", title: "A luz revela o que o olho não vê", subtitle: "Inspecionamos a pintura antes de qualquer correção.", footer: "Método Garagem do Ka", bg: "polimento" },
  { category: "bastidor", eyebrow: "Acabamento", title: "O resultado mora nos detalhes", subtitle: "Emblemas, cantos e frestas também fazem parte.", footer: "Do começo ao último toque", bg: "dashboard-detailing" },
  { category: "enquete", eyebrow: "Conta pra gente", title: "O que mais incomoda no seu carro?", subtitle: "Manchas internas ou pintura sem brilho?", footer: "Responda por mensagem", bg: "interior" },
  { category: "enquete", eyebrow: "Escolha um", title: "Brilho espelhado ou interior impecável?", subtitle: "Qual transformação você faria primeiro?", footer: "Mande sua resposta", bg: "ceramic-water-beading" },
  { category: "enquete", eyebrow: "Seu carro", title: "Você lava toda semana ou só quando precisa?", subtitle: "Sem julgamento — queremos saber.", footer: "Responda no direct", bg: "lavagem" },
  { category: "enquete", eyebrow: "Desafio", title: "Você sabe há quanto tempo não higieniza os bancos?", subtitle: "Menos de 6 meses ou já perdeu a conta?", footer: "Conte pra gente", bg: "dashboard-detailing" },
] as const;

export type SelectedStory = {
  contentType: string;
  contentKey: string;
  category: StoryCategory | string;
  render: StoryRenderInput;
};

function hashKey(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function publicAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "http://localhost:3000")
    .replace(/^([^h])/, "https://$1")
    .replace(/\/$/, "");
}

function parseCategories(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseTimes(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));
}

/** Hora atual em SP como { date: YYYY-MM-DD, hour, minute, hhmm } */
export function nowInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour") === "24" ? "0" : get("hour"));
  const minute = Number(get("minute"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function slotForPublishTime(publishTimes: string[], hhmm: string): StorySlot | null {
  const times = publishTimes.slice(0, 3);
  const idx = times.findIndex((t) => t.slice(0, 2) === hhmm.slice(0, 2));
  if (idx < 0) return null;
  return STORY_SLOTS[idx] ?? null;
}

export async function ensureInstagramAutomation() {
  return prisma.instagramAutomation.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

async function recentlyUsedKeys(days: number): Promise<Set<string>> {
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, days));
  const rows = await prisma.instagramStoryPost.findMany({
    where: { status: "published", publishedAt: { gte: since } },
    select: { contentKey: true },
  });
  return new Set(rows.map((r) => r.contentKey));
}

function serviceMatchesCategory(name: string, catalogKey: string | null, category: string): boolean {
  const hay = `${name} ${catalogKey ?? ""}`.toLowerCase();
  if (category === "lavagem") return /lavag|lava\b|wash/.test(hay);
  if (category === "polimento") return /poliment|polir|cristal/.test(hay);
  if (category === "higienizacao") return /higien|interna|oz[oô]nio|tapete/.test(hay);
  return true;
}

async function brandFooter() {
  const [settings, brand, auto] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.brand.findUnique({ where: { id: "default" } }),
    ensureInstagramAutomation(),
  ]);
  const businessName = brand?.displayName || settings?.businessName || "Garagem do Ka";
  const cta = auto.ctaText || "Agende pelo WhatsApp";
  const phone = settings?.businessPhone ? `${cta} · ${settings.businessPhone}` : cta;
  const logoDataUrl = await urlToDataUrl(brand?.logoPath);
  const accent = brand?.themeColor || "#D4AF37";
  return { businessName, phone, logoDataUrl, accent, settings };
}

async function pickServiceStory(category: string, used: Set<string>, slot: StorySlot): Promise<SelectedStory | null> {
  const services = await prisma.service.findMany({
    where: { active: true },
    include: { media: { take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: [{ menuOrder: "asc" }, { name: "asc" }],
  });
  const filtered = services.filter((s) => serviceMatchesCategory(s.name, s.catalogKey, category));
  const pool = (filtered.length ? filtered : services).filter((s) => !used.has(hashKey(["service", s.id])));
  const pick = pool[0] ?? (filtered[0] || services[0]);
  if (!pick) return null;

  const { businessName, phone, logoDataUrl, accent } = await brandFooter();
  const price = formatCurrency(Number(pick.price));
  const mediaPath = pick.media[0]?.path;
  const bgDataUrl = mediaPath ? await urlToDataUrl(mediaPath) : null;

  return {
    contentType: "service",
    contentKey: hashKey(["service", pick.id]),
    category,
    render: finalizeRender(
      {
        slot,
        brand: businessName,
        eyebrow: category.replace("_", " "),
        title: pick.name,
        subtitle: "Acabamento premium",
        footer: phone,
        accent: "#FFD60A",
        priceLabel: price,
        logoDataUrl,
        bgDataUrl,
      },
      pick.id
    ),
  };
}

async function pickAssetStory(
  type: "before_after" | "promo" | "custom",
  category: string,
  used: Set<string>,
  slot: StorySlot
): Promise<SelectedStory | null> {
  const assets = await prisma.instagramStoryAsset.findMany({
    where: {
      active: true,
      type,
      ...(category !== "promocao" && category !== "antes_depois" && category !== "geral"
        ? { OR: [{ category }, { category: "geral" }] }
        : {}),
    },
    orderBy: [{ lastUsedAt: "asc" }, { timesUsed: "asc" }, { createdAt: "asc" }],
  });

  const available = assets.filter((a) => !used.has(hashKey(["asset", a.id])));
  const pick = available[0] ?? assets[0];
  if (!pick) return null;

  const { businessName, phone, logoDataUrl, accent } = await brandFooter();
  const asDataUrl = (data: Uint8Array | null, mime: string | null | undefined) =>
    data ? `data:${mime || "image/jpeg"};base64,${Buffer.from(data).toString("base64")}` : null;
  const primary = asDataUrl(pick.imageData, pick.imageMime) || (await urlToDataUrl(pick.imageUrl));
  const secondary = asDataUrl(pick.imageDataAfter, pick.imageMimeAfter) || (await urlToDataUrl(pick.imageUrlAfter));
  const beforeDataUrl = type === "before_after" ? primary : null;
  const afterDataUrl = type === "before_after" ? secondary : null;
  const bgDataUrl = type !== "before_after" ? primary : null;

  return {
    contentType: type,
    contentKey: hashKey(["asset", pick.id]),
    category,
    render: finalizeRender({
      slot,
      brand: businessName,
      eyebrow: type === "before_after" ? "Antes & depois" : type === "promo" ? "Promo" : "Destaque",
      title: pick.title || (type === "before_after" ? "Transformação real" : "Oferta especial"),
      subtitle: pick.caption || "Resultado profissional",
      footer: phone,
      accent,
      logoDataUrl,
      beforeDataUrl,
      afterDataUrl,
      bgDataUrl,
    }),
  };
}

async function pickEditorialStory(
  category: "curiosidade" | "dica" | "bastidor" | "enquete",
  used: Set<string>,
  slot: StorySlot
): Promise<SelectedStory | null> {
  const all = EDITORIAL_STORIES.filter((story) => story.category === category);
  if (!all.length) return null;
  const publishedCount = await prisma.instagramStoryPost.count({ where: { status: "published" } });
  const ordered = [...all.slice(publishedCount % all.length), ...all.slice(0, publishedCount % all.length)];
  const pick = ordered.find((story) => !used.has(hashKey(["editorial", story.category, story.title]))) ?? ordered[0];
  if (!pick) return null;

  const { businessName, logoDataUrl, accent } = await brandFooter();
  const bundled = ["ceramic-water-beading", "dashboard-detailing", "snow-foam-wash"].includes(pick.bg);
  const bgDataUrl = await urlToDataUrl(
    `/story-assets/${pick.bg}.${bundled ? "png" : "jpg"}`
  );

  return {
    contentType: "editorial",
    contentKey: hashKey(["editorial", pick.category, pick.title]),
    category,
    render: finalizeRender(
      {
        slot,
        brand: businessName,
        eyebrow: pick.eyebrow,
        title: pick.title,
        subtitle: pick.subtitle,
        footer: pick.footer,
        accent,
        logoDataUrl,
        bgDataUrl,
      },
      `${pick.category}:${pick.title}`
    ),
  };
}

async function pickVacantSlotsStory(used: Set<string>, slot: StorySlot): Promise<SelectedStory | null> {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const duration = settings?.slotDurationMin ?? 60;
  const date = nowInSaoPaulo().date;
  const slots = await getAvailableSlots(date, duration);
  if (slots.length === 0) return null;

  const key = hashKey(["vacant", date, String(slots.length)]);
  if (used.has(key) && slots.length < 3) return null;

  const { businessName, phone, logoDataUrl, accent } = await brandFooter();
  const sample = slots.slice(0, 5).join(" · ");

  return {
    contentType: "vacant_slots",
    contentKey: key,
    category: "agenda_vaga",
    render: finalizeRender({
      slot,
      brand: businessName,
      eyebrow: "Agenda",
      title: `${slots.length} horários livres`,
      subtitle: sample,
      footer: phone,
      accent,
      logoDataUrl,
    }),
  };
}

/** Escolhe o próximo conteúdo do rodízio, evitando repetições. */
export async function selectNextStoryContent(slot: StorySlot): Promise<SelectedStory> {
  const auto = await ensureInstagramAutomation();
  const used = await recentlyUsedKeys(auto.blockRepeatDays);
  const categories = parseCategories(auto.rotationCategories);
  const rotation = categories.length ? categories : [...STORY_CATEGORIES];

  // Avança o rodízio com base em quantos posts publicados existem
  const publishedCount = await prisma.instagramStoryPost.count({ where: { status: "published" } });
  const ordered = [
    ...rotation.slice(publishedCount % rotation.length),
    ...rotation.slice(0, publishedCount % rotation.length),
  ];

  for (const category of ordered) {
    let selected: SelectedStory | null = null;

    if (category === "curiosidade" || category === "dica" || category === "bastidor" || category === "enquete") {
      selected = await pickEditorialStory(category, used, slot);
    } else if (category === "antes_depois") {
      selected = await pickAssetStory("before_after", category, used, slot);
    } else if (category === "promocao") {
      selected = await pickAssetStory("promo", category, used, slot);
      if (!selected) {
        const coupon = await prisma.coupon.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } });
        if (coupon) {
          const { businessName, phone, logoDataUrl, accent } = await brandFooter();
          selected = {
            contentType: "promo",
            contentKey: hashKey(["coupon", coupon.id]),
            category,
            render: finalizeRender({
              slot,
              brand: businessName,
              eyebrow: "Cupom",
              title: coupon.code,
              subtitle:
                coupon.type === "percent"
                  ? `${Number(coupon.amount)}% off`
                  : `${formatCurrency(Number(coupon.amount))} off`,
              footer: phone,
              accent,
              logoDataUrl,
            }),
          };
        }
      }
    } else if (category === "agenda_vaga") {
      if (auto.vacantSlotsCampaign) selected = await pickVacantSlotsStory(used, slot);
    } else if (category === "lavagem" || category === "polimento" || category === "higienizacao") {
      selected = await pickServiceStory(category, used, slot);
    } else {
      selected = await pickAssetStory("custom", category, used, slot);
      if (!selected) selected = await pickServiceStory(category, used, slot);
    }

    if (selected && !used.has(selected.contentKey)) return selected;
    if (selected) return selected;
  }

  // Fallback final
  const fallback = await pickServiceStory("lavagem", used, slot);
  if (fallback) return fallback;

  const { businessName, phone, logoDataUrl, accent } = await brandFooter();
  return {
    contentType: "fallback",
    contentKey: hashKey(["fallback", slot, nowInSaoPaulo().date]),
    category: "geral",
    render: finalizeRender({
      slot,
      brand: businessName,
      eyebrow: "Estética",
      title: "Brilho de verdade",
      subtitle: "Lavagem · polimento · higienização",
      footer: phone,
      accent,
      logoDataUrl,
    }),
  };
}

export async function previewNextStory(slot: StorySlot = "manha") {
  const selected = await selectNextStoryContent(slot);
  const jpeg = await composeStoryJpeg(selected.render);
  const imageUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  return { selected, imageUrl, content: selected.render };
}

export async function publishSelectedStory(slot: StorySlot, opts?: { dryRun?: boolean }) {
  const selected = await selectNextStoryContent(slot);
  const content = selected.render;
  const jpeg = await composeStoryJpeg(content);

  if (opts?.dryRun) {
    return {
      dryRun: true as const,
      slot,
      imageUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      selected,
      content,
      post: null,
    };
  }

  if (!isInstagramConfigured()) {
    throw new Error("Instagram não configurado (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID)");
  }

  const publicToken = randomBytes(24).toString("base64url");
  const imageUrl = `${publicAppUrl()}/api/public/instagram-story/${publicToken}`;
  const pending = await prisma.instagramStoryPost.create({
    data: {
      slot,
      contentType: selected.contentType,
      contentKey: selected.contentKey,
      title: content.title.replace(/\n/g, " "),
      subtitle: content.subtitle,
      imageUrl,
      imageData: Uint8Array.from(jpeg),
      imageMime: "image/jpeg",
      publicToken,
      status: "pending",
    },
  });

  try {
    const published = await publishInstagramStory(imageUrl);
    let reach: number | null = null;
    let impressions: number | null = null;
    try {
      const insights = await fetchStoryInsights(published.mediaId);
      reach = insights.reach;
      impressions = insights.impressions;
    } catch {
      /* insights podem falhar / demorar */
    }

    const post = await prisma.instagramStoryPost.update({
      where: { id: pending.id },
      data: {
        status: "published",
        mediaId: published.mediaId,
        creationId: published.creationId,
        publishedAt: new Date(),
        reach,
        impressions,
      },
    });

    if (selected.contentType === "before_after" || selected.contentType === "promo" || selected.contentType === "custom") {
      const assets = await prisma.instagramStoryAsset.findMany({ where: { active: true } });
      for (const a of assets) {
        if (hashKey(["asset", a.id]) === selected.contentKey) {
          await prisma.instagramStoryAsset.update({
            where: { id: a.id },
            data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
          });
          break;
        }
      }
    }

    await prisma.instagramAutomation.update({
      where: { id: "default" },
      data: { lastRunAt: new Date(), lastError: null },
    });

    return { dryRun: false as const, slot, imageUrl, selected, content, post };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao publicar";
    await prisma.instagramStoryPost.update({
      where: { id: pending.id },
      data: { status: "failed", error: message },
    });
    await prisma.instagramAutomation.update({
      where: { id: "default" },
      data: { lastRunAt: new Date(), lastError: message },
    });
    throw error;
  }
}

/** Execução fixa por slot: permite três crons diários mesmo no plano gratuito. */
export async function runInstagramStorySlotCron(slot: StorySlot) {
  const auto = await ensureInstagramAutomation();
  if (!auto.enabled) return { skipped: true as const, reason: "desativado", slot };
  const sp = nowInSaoPaulo();
  if (await alreadyPublishedSlotToday(slot, sp.date)) {
    return { skipped: true as const, reason: "ja_publicado_hoje", slot, date: sp.date };
  }
  const result = await publishSelectedStory(slot);
  return { skipped: false as const, slot, date: sp.date, result };
}

/** Já publicou este slot hoje (fuso SP)? */
export async function alreadyPublishedSlotToday(slot: StorySlot, dateIso: string) {
  const start = new Date(`${dateIso}T00:00:00-03:00`);
  const end = new Date(`${dateIso}T23:59:59.999-03:00`);
  const found = await prisma.instagramStoryPost.findFirst({
    where: {
      slot,
      status: "published",
      publishedAt: { gte: start, lte: end },
    },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Rotina do cron (a cada hora): se a hora SP casar com um horário configurado,
 * publica o slot correspondente (manhã/tarde/noite).
 */
export async function runInstagramStoriesCron(now = new Date()) {
  const auto = await ensureInstagramAutomation();
  if (!auto.enabled) {
    return { skipped: true as const, reason: "desativado" };
  }

  const sp = nowInSaoPaulo(now);
  const times = parseTimes(auto.publishTimes);
  const slot = slotForPublishTime(times, sp.hhmm);
  if (!slot) {
    return { skipped: true as const, reason: "fora_do_horario", sp, times };
  }

  if (await alreadyPublishedSlotToday(slot, sp.date)) {
    return { skipped: true as const, reason: "ja_publicado_hoje", slot, date: sp.date };
  }

  const result = await publishSelectedStory(slot);
  return { skipped: false as const, slot, date: sp.date, result };
}
