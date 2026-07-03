import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  mediaId: z.string().min(1),
  serviceId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      { success: false, error: "Não autenticado" },
      { status: 401 }
    );

  try {
    const body = await req.json();
    const { mediaId, serviceId } = schema.parse(body);

    // valida que a mídia existe
    const media = await prisma.serviceMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media)
      return NextResponse.json(
        { success: false, error: "Mídia não encontrada" },
        { status: 404 }
      );

    // valida que o serviço existe
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service)
      return NextResponse.json(
        { success: false, error: "Serviço não encontrado" },
        { status: 404 }
      );

    const updated = await prisma.serviceMedia.update({
      where: { id: mediaId },
      data: { serviceId },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: "Erro ao associar" },
      { status: 400 }
    );
  }
}


