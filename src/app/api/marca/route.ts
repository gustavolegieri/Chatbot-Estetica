import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import fs from "fs";
import path from "path";

const payloadSchema = z.object({
  displayName: z.string().optional().nullable(),
  themeColor: z.string().optional().nullable(),
  // base64 data URL for logo (optional)
  logoDataUrl: z.string().optional().nullable(),
});

export async function GET() {
  const brand = await prisma.brand.findUnique({ where: { id: "default" } });
  return NextResponse.json({ success: true, data: brand ?? null });
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = payloadSchema.parse(body);

    let logoPath: string | undefined = undefined;

    if (data.logoDataUrl) {
      // parse data URL
      const matches = data.logoDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!matches) {
        return NextResponse.json({ success: false, error: "Formato de imagem inválido." }, { status: 400 });
      }
      const mime = matches[1];
      const ext = mime.split("/")[1] || "png";
      const buffer = Buffer.from(matches[2], "base64");

      const publicDir = path.join(process.cwd(), "public");
      const uploadsDir = path.join(publicDir, "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const filename = `brand-logo.${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, buffer);

      // also copy to root logo filename used by BrandLogo fallback
      const rootLogo = path.join(publicDir, "logo-garagem-do-ka.png");
      try {
        fs.copyFileSync(filepath, rootLogo);
      } catch (e) {
        // ignore
      }

      logoPath = `/uploads/${filename}`;
    }

    const upsert = await prisma.brand.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        displayName: data.displayName ?? null,
        themeColor: data.themeColor ?? null,
        logoPath: logoPath ?? undefined,
      },
      update: {
        displayName: data.displayName ?? undefined,
        themeColor: data.themeColor ?? undefined,
        ...(logoPath ? { logoPath } : {}),
      },
    });

    return NextResponse.json({ success: true, data: upsert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos." }, { status: 400 });
    }
    console.error("[marca PUT]", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar marca." }, { status: 500 });
  }
}
