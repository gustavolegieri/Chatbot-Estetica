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
import { getDefaultPromptMap, loadPromptMap, renderPrompt, type PromptMap } from "./bot-prompts";
import { resolveServiceCategoryNum } from "./service-category";

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

export function buildCategoriesFromServices(
  services: Service[],
  prompts: PromptMap,
  suppressedKeys: Set<string> = new Set()
): Record<number, { title: string; keys: string[] }> {
  const result: Record<number, { title: string; keys: string[] }> = {};

  for (const [numStr, cat] of Object.entries(CATEGORIES)) {
    const num = Number(numStr);
    // Uma categoria estática vazia não deve ocupar uma opção do menu. Ela
    // continua podendo aparecer abaixo se houver serviço ativo nela no banco.
    if (cat.keys.length === 0) continue;
    result[num] = {
      title: renderPrompt(prompts, `category_${num}`, {}) || cat.title,
      keys: [],
    };
  }

  const whatsappServices = services
    .filter((s) => s.active && s.showInWhatsApp && s.catalogKey)
    .sort((a, b) => a.menuOrder - b.menuOrder || a.name.localeCompare(b.name));

  // Onde cada chave cadastrada no banco deve aparecer. Serve para tirar a chave
  // da categoria estática quando o cadastro a moveu para outra categoria.
  const dbCategoryByKey = new Map<string, number>();
  for (const s of whatsappServices) {
    dbCategoryByKey.set(s.catalogKey!, resolveServiceCategoryNum(s));
  }

  for (const [key, catNum] of dbCategoryByKey) {
    if (!result[catNum]) {
      result[catNum] = { title: `Categoria ${catNum}`, keys: [] };
    }
    result[catNum].keys.push(key);
  }

  // O catálogo oficial (`fluxo-oficial.md`) é a lista base de serviços; o banco
  // sobrescreve preço/detalhe e pode acrescentar itens novos. Por isso as duas
  // listas são MESCLADAS. Antes o bloco abaixo só valia para categoria vazia, o
  // que fazia um único serviço cadastrado esconder os demais da mesma categoria
  // (ex.: "Lavagem Simples" no banco ocultava Completa e Detalhada).
  for (const numStr of Object.keys(result)) {
    const n = Number(numStr);
    const staticKeys = CATEGORIES[n]?.keys ?? [];
    const restored = staticKeys.filter((key) => {
      if (suppressedKeys.has(key)) return false; // desativado de propósito no painel
      const dbCategory = dbCategoryByKey.get(key);
      return dbCategory === undefined || dbCategory === n;
    });
    // Ordem oficial primeiro; serviços que só existem no banco entram depois.
    result[n].keys = [...new Set([...restored, ...result[n].keys])];
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

  const wctxMock = (globalThis as any)?.__BB_WCTX_MOCK__;
  if (wctxMock) {
    return wctxMock as WhatsAppCatalogContext;
  }

  let services: Array<Service & { upsellService?: Service | null }> = [];
  let prompts: PromptMap = getDefaultPromptMap();
  // Chaves oficiais que o painel desativou ou tirou do WhatsApp de propósito.
  // Sem essa lista, a mesclagem com o catálogo estático faria um serviço
  // desligado voltar a aparecer no menu.
  let suppressedKeys = new Set<string>();
  try {
    const [active, hidden, promptMap] = await Promise.all([
      prisma.service.findMany({
        where: { active: true, showInWhatsApp: true },
        include: { upsellService: true },
        orderBy: [{ categoryNum: "asc" }, { menuOrder: "asc" }, { name: "asc" }],
      }),
      prisma.service.findMany({
        where: { catalogKey: { not: null }, OR: [{ active: false }, { showInWhatsApp: false }] },
        select: { catalogKey: true },
      }),
      loadPromptMap(force),
    ]);
    services = active;
    prompts = promptMap;
    suppressedKeys = new Set(hidden.map((s) => s.catalogKey!).filter(Boolean));
  } catch (error) {
    console.error("[WhatsApp Catalog] Banco indisponível; usando catálogo oficial local.", error);
  }


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

  const categories = buildCategoriesFromServices(services, prompts, suppressedKeys);
  const ctx: WhatsAppCatalogContext = { catalog, categories, servicesByKey, dbServiceIdByKey, prompts };
  catalogCache = { ctx, loadedAt: Date.now() };
  return ctx;
}

export function invalidateCatalogCache() {
  catalogCache = null;
}

/** Chaves que não representam um serviço com preço próprio. */
const KEYS_SEM_PRECO = new Set(["indeciso", "pacotes"]);

/**
 * Menor preço praticado na categoria, para o rótulo "a partir de".
 * Ignora itens sem valor cadastrado — eles não devem puxar o mínimo para zero.
 */
export function categoryStartingPrice(
  keys: string[],
  catalog: Record<string, CatalogItem>
): number | null {
  const valores = keys
    .filter((key) => !KEYS_SEM_PRECO.has(key))
    .map((key) => Number(catalog[key]?.hatchMin ?? 0))
    .filter((valor) => Number.isFinite(valor) && valor > 0);
  return valores.length ? Math.min(...valores) : null;
}

function precoCurto(valor: number): string {
  return Number.isInteger(valor)
    ? `R$ ${valor}`
    : `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

/**
 * O preço aparece já no menu principal. Antes o cliente precisava de três
 * cliques (menu → categoria → serviço) só para descobrir quanto custava, e quem
 * estava pesquisando preço desistia antes de chegar lá.
 */
const ICONES_DE_CATEGORIA: Record<number, string> = {
  1: "💧",
  2: "✨",
  3: "🛡️",
  4: "🪑",
  5: "🔬",
  6: "🔄",
  7: "📦",
  8: "🤔",
};

export interface MainMenuEntry {
  /** Número que o cliente digita ou toca. */
  display: number;
  /** Categoria correspondente no catálogo. */
  categoryNum: number;
  title: string;
  icon: string;
  startingPrice: number | null;
}

/**
 * Opções visíveis do menu principal, numeradas sem buracos.
 *
 * A categoria 6 ("Revitalização") existe no catálogo estático mas não tem
 * serviço próprio — seus itens vivem na 3. Numerar pela categoria fazia o menu
 * pular do *5* para o *7*, e sobrava a impressão de opção quebrada. Agora a
 * posição na lista é a numeração, e o mapa de volta mora aqui, num lugar só,
 * para a leitura da resposta continuar casando com o que foi mostrado.
 */
export function mainMenuEntries(
  categories: WhatsAppCatalogContext["categories"],
  catalog?: Record<string, CatalogItem>
): MainMenuEntry[] {
  const entradas: MainMenuEntry[] = [];
  for (let categoryNum = 1; categoryNum <= MAIN_MENU_CATEGORIES; categoryNum++) {
    const cat = categories[categoryNum];
    if (!cat || cat.keys.length === 0) continue;
    entradas.push({
      display: entradas.length + 1,
      categoryNum,
      title: cat.title,
      icon: ICONES_DE_CATEGORIA[categoryNum] ?? "•",
      startingPrice: catalog ? categoryStartingPrice(cat.keys, catalog) : null,
    });
  }
  return entradas;
}

/** Converte o número digitado pelo cliente na categoria que ele viu. */
export function categoryFromMenuNumber(
  categories: WhatsAppCatalogContext["categories"],
  escolhido: number
): number | null {
  return mainMenuEntries(categories).find((e) => e.display === escolhido)?.categoryNum ?? null;
}

/**
 * O preço aparece já no menu principal. Antes o cliente precisava de três
 * cliques (menu → categoria → serviço) só para descobrir quanto custava, e quem
 * estava pesquisando preço desistia antes de chegar lá.
 */
export function buildMainMenu(
  categories: WhatsAppCatalogContext["categories"],
  prompts: PromptMap,
  catalog?: Record<string, CatalogItem>
): string {
  const lines = mainMenuEntries(categories, catalog).map((entrada) => {
    const sufixo = entrada.startingPrice ? ` — a partir de ${precoCurto(entrada.startingPrice)}` : "";
    return `*${entrada.display}* ${entrada.icon} ${entrada.title}${sufixo}`;
  });
  // A opção 9 é fixa: atendimento humano, fora da numeração das categorias.
  lines.push(`*9* 👤 Falar com atendente`);
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
): { complement: string; benefit: string; value: number; durationMin: number } | null {
  const service = ctx.servicesByKey[key];
  if (service?.upsellService) {
    const originalPrice = num(service.upsellService.price);
    const discount = Math.max(0, num(service.upsellDiscount));
    const value = Math.max(0, originalPrice - discount);

    // Não ofereça complemento sem preço comercial configurado, nem um
    // complemento cujo desconto deixaria o preço exibido zerado.
    if (!Number.isFinite(originalPrice) || originalPrice <= 0 || value <= 0) {
      return null;
    }

    return {
      complement: service.upsellService.name,
      benefit: service.upsellBenefit ?? "aproveita a visita e deixa tudo pronto de uma vez.",
      value,
      durationMin: Math.max(0, service.upsellService.durationMin),
    };
  }
  return null;
}

export { BRAND_DEFAULT, MAIN_MENU_CATEGORIES, UNDECIDED_TO_KEY };
