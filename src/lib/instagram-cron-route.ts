import { NextRequest, NextResponse } from "next/server";
import { runInstagramStorySlotCron } from "@/lib/instagram-automation";
import type { StorySlot } from "@/lib/instagram-story";

export async function handleInstagramSlotCron(request: NextRequest, slot: StorySlot) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = request.nextUrl.searchParams.get("secret");
  if ((auth || query) !== secret) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const result = await runInstagramStorySlotCron(slot);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(`[Cron/Instagram/${slot}]`, error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Falha na publicação automática",
    }, { status: 200 });
  }
}
