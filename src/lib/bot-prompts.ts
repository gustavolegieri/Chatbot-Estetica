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

  const rows = await prisma.botPrompt.findMany();
  const map = defaultMap();
  for (const row of rows) map[row.key] = row.content;

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
