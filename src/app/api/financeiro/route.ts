import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const createSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.enum(["SERVICE", "PRODUCT", "SALARY", "RENT", "UTILITIES", "SUPPLIES", "OTHER"]).optional(),
  amount: z.number().positive(),
  description: z.string().min(2),
  date: z.string().optional(),
  appointmentId: z.string().optional(),
  serviceId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type");
  const month = request.nextUrl.searchParams.get("month");

  let dateFilter = undefined;
  if (month) {
    const [year, m] = month.split("-").map(Number);
    dateFilter = {
      gte: new Date(year, m - 1, 1),
      lte: new Date(year, m, 0, 23, 59, 59),
    };
  }

  const records = await prisma.financialRecord.findMany({
    where: {
      ...(type ? { type: type as "INCOME" | "EXPENSE" } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    include: { service: true, appointment: { include: { client: true } } },
    orderBy: { date: "desc" },
  });

  const summary = await prisma.financialRecord.groupBy({
    by: ["type"],
    where: dateFilter ? { date: dateFilter } : undefined,
    _sum: { amount: true },
  });

  return NextResponse.json({ success: true, data: { records, summary } });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = createSchema.parse(body);

    const record = await prisma.financialRecord.create({
      data: {
        ...data,
        date: data.date ? new Date(data.date) : new Date(),
        userId: session.userId,
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: "Erro ao criar registro" }, { status: 500 });
  }
}
