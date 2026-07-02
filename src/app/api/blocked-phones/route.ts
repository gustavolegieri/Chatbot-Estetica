import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

const createSchema = z.object({
  phone: z.string().min(5),
  reason: z.string().min(2).optional().default("Bloqueado pelo administrador"),
});

export async function GET(_request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const items = await prisma.blockedPhone.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: items });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const created = await prisma.blockedPhone.create({
      data: {
        phone: normalizePhone(data.phone),
        reason: data.reason,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: any) {
    const message = String(err?.message ?? err ?? "Erro ao criar bloqueio");
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

