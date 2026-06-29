import { prisma } from "./prisma";
import { BOT_PROMPT_DEFAULTS } from "./bot-prompt-defaults";

export type PromptMap = Record<string, string>;

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

export function applyPrompt(template: string, vars: Record<string, string | undefined | null>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value ?? "");
  }
  return out
    .split("\n")
    .filter((line, i, arr) => {
      if (line.trim() !== "") return true;
      const prev = arr[i - 1];
      return prev !== undefined && prev.trim() !== "";
    })
    .join("\n")
    .trim();
}

export function renderPrompt(
  prompts: PromptMap,
  key: string,
  vars: Record<string, string | undefined | null> = {}
): string {
  const template = prompts[key] ?? defaultMap()[key] ?? "";
  return applyPrompt(template, vars);
}

export async function seedBotPrompts() {
  for (const p of BOT_PROMPT_DEFAULTS) {
    await prisma.botPrompt.upsert({
      where: { key: p.key },
      update: {},
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
