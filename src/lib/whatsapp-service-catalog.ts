import type { Service } from "@prisma/client";
import { prisma } from "./prisma";
import {
  BRAND_DEFAULT,
  CATALOG,
  CATEGORIES,
  MAIN_MENU_CATEGORIES,
  UNDECIDED_TO_KEY,
  type CatalogItem,
} from "./whatsapp-catalog";
import { loadPromptMap, renderPrompt, type PromptMap } from "./bot-prompts";

export interface WhatsAppCatalogContext {
  catalog: Record<string, CatalogItem>;
  categories: Record<number, { title: string; keys: string[] }>;
  servicesByKey: Record<string, Service & { upsellService?: Service | null }>;
  dbServiceIdByKey: Record<string, string>;
  prompts: PromptMap;
}

function num(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

function serviceToCatalogItem(s: Service): CatalogItem {
  const fallback = s.catalogKey ? CATALOG[s.catalogKey] : undefined;
  return {
    key: s.catalogKey ?? s.id,
    label: s.name,
    short: s.whatsappShort ?? s.description ?? fallback?.short ?? s.name,
    pitch: s.whatsappPitch ?? fallback?.pitch ?? "",
    dbMatch: s.name,
    time: s.timeEstimate ?? fallback?.time ?? `${s.durationMin} min`,
    hatchMin: num(s.priceHatchMin) || num(fallback?.hatchMin) || num(s.price),
    hatchMax: num(s.priceHatchMax) || num(fallback?.hatchMax) || num(s.price),
    suvMin: num(s.priceSuvMin) || num(fallback?.suvMin) || num(s.price),
    suvMax: num(s.priceSuvMax) || num(fallback?.suvMax) || num(s.price),
  };
}

function buildCategoriesFromServices(
  services: Service[],
  prompts: PromptMap
): Record<number, { title: string; keys: string[] }> {
  const result: Record<number, { title: string; keys: string[] }> = {};

  for (const [numStr, cat] of Object.entries(CATEGORIES)) {
    const num = Number(numStr);
    result[num] = {
      title: renderPrompt(prompts, `category_${num}`, {}) || cat.title,
      keys: [],
    };
  }

  const whatsappServices = services
    .filter((s) => s.active && s.showInWhatsApp && s.catalogKey)
    .sort((a, b) => a.menuOrder - b.menuOrder || a.name.localeCompare(b.name));

  for (const s of whatsappServices) {
    const catNum = s.categoryNum ?? 1;
    if (!result[catNum]) {
      result[catNum] = { title: `Categoria ${catNum}`, keys: [] };
    }
    result[catNum].keys.push(s.catalogKey!);
  }

  for (const num of Object.keys(result)) {
    const n = Number(num);
    if (result[n].keys.length === 0 && CATEGORIES[n]) {
      result[n].keys = [...CATEGORIES[n].keys];
    }
  }

  if (!result[8]?.keys.includes("indeciso")) {
    result[8] = result[8] ?? { title: "Ajuda na escolha", keys: [] };
    if (!result[8].keys.includes("indeciso")) result[8].keys.push("indeciso");
  }

  return result;
}

let catalogCache: { ctx: WhatsAppCatalogContext; loadedAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 30_000;

export async function loadWhatsAppCatalog(force = false): Promise<WhatsAppCatalogContext> {
  if (!force && catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache.ctx;
  }

  const [services, prompts] = await Promise.all([
    prisma.service.findMany({
      where: { active: true, showInWhatsApp: true },
      include: { upsellService: true },
      orderBy: [{ categoryNum: "asc" }, { menuOrder: "asc" }, { name: "asc" }],
    }),
    loadPromptMap(force),
  ]);

  const catalog: Record<string, CatalogItem> = { ...CATALOG };
  const servicesByKey: WhatsAppCatalogContext["servicesByKey"] = {};
  const dbServiceIdByKey: Record<string, string> = {};

  for (const s of services) {
    if (!s.catalogKey) continue;
    const item = serviceToCatalogItem(s);
    catalog[s.catalogKey] = item;
    servicesByKey[s.catalogKey] = s;
    dbServiceIdByKey[s.catalogKey] = s.id;
  }

  const categories = buildCategoriesFromServices(services, prompts);
  const ctx: WhatsAppCatalogContext = { catalog, categories, servicesByKey, dbServiceIdByKey, prompts };
  catalogCache = { ctx, loadedAt: Date.now() };
  return ctx;
}

export function invalidateCatalogCache() {
  catalogCache = null;
}

export function buildMainMenu(categories: WhatsAppCatalogContext["categories"], prompts: PromptMap): string {
  const lines: string[] = [];
  const icons = ["💧", "✨", "🛡️", "🪑", "🔬", "🔄", "📦", "🤔"];
  for (let i = 1; i <= MAIN_MENU_CATEGORIES; i++) {
    const cat = categories[i];
    if (!cat) continue;
    lines.push(`*${i}* ${icons[i - 1] ?? "•"} ${cat.title}`);
  }
  return lines.join("\n");
}

export function subMenuForCategoryCtx(
  categoryNum: number,
  ctx: WhatsAppCatalogContext
): string {
  const cat = ctx.categories[categoryNum];
  if (!cat) return "";
  const lines = cat.keys
    .filter((k) => k !== "indeciso")
    .map((key, i) => {
      const item = ctx.catalog[key];
      return item ? `*${i + 1}* — ${item.label}` : null;
    })
    .filter(Boolean);
  return [`*${cat.title}* — qual opção?`, ``, ...lines, ``, `*0* — Voltar ao menu principal`].join("\n");
}

export function getUpsellForKey(
  key: string,
  ctx: WhatsAppCatalogContext
): { complement: string; benefit: string } | null {
  const service = ctx.servicesByKey[key];
  if (service?.upsellService) {
    return {
      complement: service.upsellService.name,
      benefit: service.upsellBenefit ?? "aproveita a visita e deixa tudo pronto de uma vez.",
    };
  }
  return null;
}

export { BRAND_DEFAULT, MAIN_MENU_CATEGORIES, UNDECIDED_TO_KEY };
