import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import { sendMedia } from "@/lib/evolution-api";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const schema = z.object({
  mediaId: z.string().min(1).optional(),
  serviceId: z.string().min(1),
  phone: z.string().min(5),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await req.json();
    const { mediaId, serviceId, phone } = schema.parse(body);

    // A lógica do bot envia a primeira mídia associada ao serviço.
    // Aqui damos prioridade à mediaId, se fornecida.
    let media = null as any;
    if (mediaId) {
      media = await prisma.serviceMedia.findFirst({
        where: { id: mediaId, serviceId },
      });
    }

    if (!media) {
      media = await prisma.serviceMedia.findFirst({
        where: { serviceId },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!media?.path) {
      return NextResponse.json({ success: false, error: "Nenhuma mídia encontrada para este serviço" }, { status: 404 });
    }

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const caption = service?.name ?? media.filename;
    const mediaType = media.mimeType?.startsWith("video/")
      ? "video"
      : media.mimeType?.startsWith("image/")
      ? "image"
      : "document";

    await sendMedia({
      number: phone,
      mediaUrl: media.path,
      caption,
      filename: media.filename,
      mediaType,
    });

    // pequena folga para o WhatsApp processar
    await delay(400);

    return NextResponse.json({ success: true, data: { sent: true, mediaId: media.id, serviceId, phone } });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ success: false, error: "Erro ao enviar" }, { status: 500 });
  }
}

