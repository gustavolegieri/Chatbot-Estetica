import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const post = await prisma.instagramStoryPost.findUnique({
    where: { publicToken: token },
    select: { imageData: true, imageMime: true },
  });
  if (!post?.imageData) return new NextResponse("Imagem não encontrada", { status: 404 });
  return new NextResponse(Buffer.from(post.imageData), {
    headers: {
      "Content-Type": post.imageMime || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
