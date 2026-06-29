import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parse, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createSchema = z.object({
  date: z.string(),
  reason: z.string().min(2),
  isHoliday: z.boolean().default(false),
  blockStart: z.string().optional().nullable(),
  blockEnd: z.string().optional().nullable(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const items = await prisma.blockedDate.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json({ success: true, data: items });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = createSchema.parse(body);
    const date = startOfDay(parse(data.date, "yyyy-MM-dd", new Date()));

    const item = await prisma.blockedDate.create({
      data: {
        date,
        reason: data.reason,
        isHoliday: data.isHoliday,
        blockStart: data.blockStart || null,
        blockEnd: data.blockEnd || null,
      },
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao criar bloqueio" }, { status: 400 });
  }
}
