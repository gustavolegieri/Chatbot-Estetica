import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidatePromptCache } from "@/lib/bot-prompts";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const prompts = await prisma.botPrompt.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }] });
  return NextResponse.json({ success: true, data: prompts });
}

const updateSchema = z.object({
  content: z.string().min(1),
});

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const { key, content } = z.object({ key: z.string(), content: z.string().min(1) }).parse(body);
    const prompt = await prisma.botPrompt.update({
      where: { key },
      data: { content },
    });
    invalidatePromptCache();
    return NextResponse.json({ success: true, data: prompt });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao salvar prompt" }, { status: 400 });
  }
}
