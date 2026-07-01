import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["ADMIN", "OPERATOR"]).optional(),
  active: z.boolean().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
    }
    throw error;
  }

  try {
    const body = await request.json();
    const data = updateUserSchema.parse(body);

    if (data.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== id) {
        return NextResponse.json(
          { success: false, error: "Outro usuário já usa este e-mail." },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      ...data,
    };

    if (data.password === undefined) {
      delete updateData.password;
    } else if (typeof data.password === "string") {
      updateData.password = await bcrypt.hash(data.password, 12);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos para atualização." }, { status: 400 });
    }
    console.error("[usuarios PUT]", error);
    return NextResponse.json({ success: false, error: "Erro ao atualizar usuário." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
    }
    throw error;
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[usuarios DELETE]", error);
    return NextResponse.json({ success: false, error: "Erro ao excluir usuário." }, { status: 500 });
  }
}
