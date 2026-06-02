import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials, createSession } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function loginErrorMessage(error: unknown): string {
  if (!process.env.JWT_SECRET) {
    return "JWT_SECRET não configurado no servidor";
  }
  if (!process.env.DATABASE_URL) {
    return "DATABASE_URL não configurado no servidor";
  }
  const msg = error instanceof Error ? error.message : String(error);
  if (/Can't reach database|P1001|P1000|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return "Não foi possível conectar ao banco. Verifique DATABASE_URL na Vercel (Supabase).";
  }
  if (/JWT_SECRET/i.test(msg)) {
    return "JWT_SECRET não configurado no servidor";
  }
  return "Erro interno";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = schema.parse(body);

    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    await createSession(user);

    return NextResponse.json({ success: true, data: { name: user.name, email: user.email } });
  } catch (error) {
    console.error("[auth/login]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: loginErrorMessage(error) },
      { status: 500 }
    );
  }
}
