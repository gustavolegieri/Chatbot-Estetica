import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidatePromptCache, seedBotPrompts } from "@/lib/bot-prompts";
import { BOT_PROMPT_DEFAULTS } from "@/lib/bot-prompt-defaults";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  let count = await prisma.botPrompt.count();
  if (count === 0) {
    await seedBotPrompts();
    invalidatePromptCache();
    count = await prisma.botPrompt.count();
  }

  const prompts = await prisma.botPrompt.findMany({
    orderBy: [{ category: "asc" }, { label: "asc" }],
  });

  const byCategory = prompts.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    data: prompts,
    meta: {
      total: prompts.length,
      expected: BOT_PROMPT_DEFAULTS.length,
      byCategory,
      wasSeeded: count > 0,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { key, content } = body as { key: string; content: string };
    if (!key || !content?.trim()) {
      return NextResponse.json({ success: false, error: "Conteúdo inválido" }, { status: 400 });
    }

    const prompt = await prisma.botPrompt.update({
      where: { key },
      data: { content: content.trim() },
    });
    invalidatePromptCache();
    return NextResponse.json({ success: true, data: prompt });
  } catch {
    return NextResponse.json({ success: false, error: "Prompt não encontrado" }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action;

    if (action === "seed") {
      const force = (body as { force?: boolean }).force === true;
      await seedBotPrompts({ force });
      invalidatePromptCache();
      const total = await prisma.botPrompt.count();
      return NextResponse.json({ success: true, data: { total, force } });
    }

    if (action === "reset") {
      const key = (body as { key?: string }).key;
      if (!key) return NextResponse.json({ success: false, error: "Key obrigatória" }, { status: 400 });

      const def = BOT_PROMPT_DEFAULTS.find((p) => p.key === key);
      if (!def) return NextResponse.json({ success: false, error: "Prompt padrão não encontrado" }, { status: 404 });

      const prompt = await prisma.botPrompt.update({
        where: { key },
        data: { content: def.content },
      });
      invalidatePromptCache();
      return NextResponse.json({ success: true, data: prompt });
    }

    return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao processar" }, { status: 500 });
  }
}
