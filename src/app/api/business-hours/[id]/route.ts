import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT - Atualizar horário de funcionamento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { dayOfWeek, openTime, closeTime, isOpen } = body;

    const businessHour = await prisma.businessHour.update({
      where: { id },
      data: {
        ...(dayOfWeek !== undefined && { dayOfWeek }),
        ...(openTime !== undefined && { openTime }),
        ...(closeTime !== undefined && { closeTime }),
        ...(isOpen !== undefined && { isOpen }),
      },
    });

    return NextResponse.json(businessHour);
  } catch (error) {
    console.error("[business-hours] PUT error:", error);
    return NextResponse.json({ error: "Erro ao atualizar horário" }, { status: 500 });
  }
}

// DELETE - Deletar horário de funcionamento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.businessHour.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[business-hours] DELETE error:", error);
    return NextResponse.json({ error: "Erro ao deletar horário" }, { status: 500 });
  }
}
