import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMedia } from "@/lib/evolution-api";
import { z } from "zod";

const schema = z.object({
  mediaId: z.string().min(1).optional(),
  serviceId: z.string().min(1),
  phone: z.string().min(5),
});

/**
 * DEBUG ENDPOINT - sem autenticação para testar Wasender
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mediaId, serviceId, phone } = schema.parse(body);

    let media = null as any;
    if (mediaId) {
      media = await prisma.serviceMedia.findFirst({
        where: { id: mediaId, serviceId },
      });
    } else {
      media = await prisma.serviceMedia.findFirst({
        where: { serviceId },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!media?.path) {
      return NextResponse.json(
        { error: "Mídia não encontrada" },
        { status: 404 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    const caption = service?.name || "Imagem";
    const mediaType = media.mimeType?.startsWith("video/")
      ? "video"
      : media.mimeType?.startsWith("image/")
      ? "image"
      : "document";

    const result: any = await sendMedia({
      number: phone,
      mediaUrl: media.path,
      caption,
      filename: media.filename,
      mediaType,
    });

    return NextResponse.json({
      success: true,
      data: {
        sent: result?.simulated !== true,
        pending: result?.simulated === true,
        simulated: result?.simulated || false,
        mediaId: media.id,
        serviceId,
        phone,
        result,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao enviar" },
      { status: 500 }
    );
  }
}
