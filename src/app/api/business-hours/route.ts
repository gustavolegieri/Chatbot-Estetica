import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Listar horários de funcionamento
export async function GET() {
  try {
    const businessHours = await prisma.businessHour.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });
    return NextResponse.json(businessHours);
  } catch (error) {
    console.error("[business-hours] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar horários" }, { status: 500 });
  }
}

// POST - Criar horário de funcionamento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { dayOfWeek, openTime, closeTime, isOpen } = body;

    const businessHour = await prisma.businessHour.create({
      data: {
        dayOfWeek,
        openTime,
        closeTime,
        isOpen: isOpen ?? true,
      },
    });

    return NextResponse.json(businessHour, { status: 201 });
  } catch (error) {
    console.error("[business-hours] POST error:", error);
    return NextResponse.json({ error: "Erro ao criar horário" }, { status: 500 });
  }
}
