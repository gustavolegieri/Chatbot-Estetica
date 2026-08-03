import { prisma } from "./prisma";
import { BOT_PROMPT_DEFAULTS } from "./bot-prompt-defaults";
import { applyPrompt } from "./prompt-utils";

export type PromptMap = Record<string, string>;
export { applyPrompt };

let cache: { map: PromptMap; loadedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function defaultMap(): PromptMap {
  const map: PromptMap = {};
  for (const p of BOT_PROMPT_DEFAULTS) map[p.key] = p.content;
  return map;
}

export async function loadPromptMap(force = false): Promise<PromptMap> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.map;
  }

  // Se o ambiente estiver rodando em modo de teste sem DB (ex.: transcript mocks),
  // use o mapa padrão local para evitar inicialização do Prisma.
  const useFallbackPrompts = (globalThis as any)?.__BB_USE_PROMPT_FALLBACK__;

  if (useFallbackPrompts) {
    const map = defaultMap();
    cache = { map, loadedAt: Date.now() };
    return map;
  }

  const map = defaultMap();
  try {
    const rows = await prisma.botPrompt.findMany();
    for (const row of rows) map[row.key] = row.content;
  } catch (error) {
    // O atendimento continua com os templates oficiais locais durante uma
    // indisponibilidade momentânea do banco. Assim o cliente nunca recebe um
    // erro técnico e o painel pode ser testado sem depender da rede externa.
    console.error("[Bot Prompts] Banco indisponível; usando templates oficiais locais.", error);
  }

  cache = { map, loadedAt: Date.now() };
  return map;
}

export function renderPrompt(
  prompts: PromptMap,
  key: string,
  vars: Record<string, string | undefined | null> = {}
): string {
  const template = prompts[key] ?? defaultMap()[key] ?? "";
  return applyPrompt(template, vars);
}

export function getDefaultPromptContent(key: string): string | null {
  return BOT_PROMPT_DEFAULTS.find((p) => p.key === key)?.content ?? null;
}

export async function seedBotPrompts(options?: { force?: boolean }) {
  for (const p of BOT_PROMPT_DEFAULTS) {
    await prisma.botPrompt.upsert({
      where: { key: p.key },
      update: options?.force
        ? {
            label: p.label,
            category: p.category,
            content: p.content,
            hint: p.hint ?? null,
          }
        : {},
      create: {
        key: p.key,
        label: p.label,
        category: p.category,
        content: p.content,
        hint: p.hint ?? null,
      },
    });
  }
}

export function invalidatePromptCache() {
  cache = null;
}

export function getDefaultPromptMap(): PromptMap {
  return defaultMap();
}
