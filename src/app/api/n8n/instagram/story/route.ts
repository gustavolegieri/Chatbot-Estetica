import { NextRequest } from "next/server";
import { z } from "zod";
import { isValidN8nApiKey, unauthorizedN8nResponse, n8nError, n8nOk } from "@/lib/auth-n8n";
import { isInstagramConfigured } from "@/lib/instagram-publish";
import { publishSelectedStory } from "@/lib/instagram-automation";
import { STORY_SLOTS, isStorySlot } from "@/lib/instagram-story";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slot: z.enum(STORY_SLOTS),
  dry_run: z.boolean().optional().default(false),
});

/**
 * Publica 1 Instagram Story por chamada (mesmo motor do painel/cron).
 * Preferir o cron + painel; este endpoint permanece para n8n se quiser.
 */
export async function POST(request: NextRequest) {
  if (!isValidN8nApiKey(request)) return unauthorizedN8nResponse();

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return n8nError(
        `Body inválido. Use slot: ${STORY_SLOTS.join(" | ")}. Ex: {"slot":"manha"}`,
        400
      );
    }

    const { slot, dry_run } = parsed.data;
    if (!isStorySlot(slot)) return n8nError("slot inválido", 400);

    if (!dry_run && !isInstagramConfigured()) {
      return n8nError(
        "Defina INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID no ambiente",
        503
      );
    }

    const result = await publishSelectedStory(slot, { dryRun: dry_run });
    return n8nOk(result, dry_run ? 200 : 201);
  } catch (error) {
    console.error("[n8n/instagram/story]", error);
    return n8nError(error instanceof Error ? error.message : "Erro ao publicar story", 500);
  }
}
