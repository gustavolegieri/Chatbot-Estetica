import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const asset = await prisma.instagramStoryAsset.findUnique({
    where: { publicToken: token },
    select: { imageData: true, imageDataAfter: true, imageMime: true, imageMimeAfter: true },
  });
  const after = request.nextUrl.searchParams.get("variant") === "after";
  const data = after ? asset?.imageDataAfter : asset?.imageData;
  const mime = after ? asset?.imageMimeAfter : asset?.imageMime;
  if (!data) return new NextResponse("Imagem não encontrada", { status: 404 });
  return new NextResponse(Buffer.from(data), {
    headers: {
      "Content-Type": mime || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
