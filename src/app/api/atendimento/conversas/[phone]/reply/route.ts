import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendText } from "@/lib/evolution-api";
import { logWhatsAppMessage } from "@/lib/whatsapp-message-log";
import { normalizePhone } from "@/lib/utils";
import { MessageDirection, MessageSender } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const { phone: rawPhone } = await params;
  const phone = normalizePhone(decodeURIComponent(rawPhone));
  const body = await request.json();
  const text = (body.text as string)?.trim();

  if (!text) {
    return NextResponse.json({ success: false, error: "Mensagem vazia" }, { status: 400 });
  }

  const waSession = await prisma.whatsAppSession.findUnique({
    where: { phone },
    include: { client: true },
  });

  if (!waSession) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada" }, { status: 404 });
  }

  await sendText({
    number: phone,
    text,
    sender: "ADMIN",
    skipBotLog: true,
    flowStage: "HANDOFF",
  });

  const message = await logWhatsAppMessage({
    phone,
    sessionId: waSession.id,
    clientId: waSession.clientId,
    direction: MessageDirection.OUTBOUND,
    sender: MessageSender.ADMIN,
    body: text,
    flowStage: "HANDOFF",
  });

  return NextResponse.json({ success: true, data: message });
}
