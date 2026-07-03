import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendMedia } from "@/lib/evolution-api";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const schema = z.object({
  mediaId: z.string().min(1).optional(),
  serviceId: z.string().min(1),
  phone: z.string().min(5),
});

/**
 * DEBUG ENDPOINT — SEM AUTENTICAÇÃO
 * Use apenas para diagnosticar problemas de envio Wasender
 * REMOVER APÓS TESTES
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

    console.log("[DEBUG] Enviando mídia:", { mediaId: media.id, serviceId, phone, mediaPath: media.path, caption });

    let result: any;
    try {
      result = await sendMedia({
        number: phone,
        mediaUrl: media.path,
        caption,
        filename: media.filename,
        mediaType,
      });
      console.log("[DEBUG] Resultado sendMedia:", result);
    } catch (err: any) {
      console.error("[DEBUG] Erro sendMedia:", err?.message || err);
      return NextResponse.json({
        success: true,
        data: {
          sent: false,
          pending: true,
          error: err?.message || "Erro desconhecido",
          warning: "WhatsApp não está conectado ou Wasender não foi configurado.",
          mediaId: media.id,
          serviceId,
          phone,
        },
      });
    }

    const isSimulated = result?.simulated === true;
    const isBlocked = result?.blocked === true;
    if (isBlocked) {
      return NextResponse.json({
        success: false,
        error: "Envio bloqueado. Verifique o telefone e tente novamente.",
      }, { status: 400 });
    }

    await delay(400);

    return NextResponse.json({
      success: true,
      data: {
        sent: !isSimulated,
        pending: isSimulated,
        simulated: isSimulated,
        mediaId: media.id,
        serviceId,
        phone,
        result,
      },
    });
  } catch (err: any) {
    console.error("[DEBUG] Erro geral:", err);
    return NextResponse.json({ success: false, error: err?.message || "Erro ao enviar" }, { status: 500 });
  }
}
