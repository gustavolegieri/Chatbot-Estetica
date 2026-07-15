import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sendText } from "@/lib/evolution-api";
import { logWhatsAppMessage } from "@/lib/whatsapp-message-log";
import { normalizePhone } from "@/lib/utils";
import { MessageDirection, MessageSender } from "@/lib/message-enums";

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

  // Validação: rejeitar mensagens com apenas caracteres especiais ou muito curtas (menor que 2 caracteres)
  // e que contenham apenas símbolos, números repetidos, etc.
  const cleanedText = text.replace(/[^a-z0-9áàâãéèêíïóôõöúçñ\s]/gi, "").trim();
  if (cleanedText.length === 0) {
    return NextResponse.json({ 
      success: false, 
      error: "Mensagem contém apenas caracteres especiais" 
    }, { status: 400 });
  }

  const waSession = await prisma.whatsAppSession.findUnique({
    where: { phone },
    include: { client: true },
  });

  if (!waSession) {
    return NextResponse.json({ success: false, error: "Conversa não encontrada" }, { status: 404 });
  }

  console.log("[Reply] Enviando mensagem para", phone, {
    textLength: text.length,
    textPreview: text.substring(0, 50),
  });

  const result = await sendText({
    number: phone,
    text,
    sender: "ADMIN",
    skipBotLog: true,
    flowStage: "HANDOFF",
  });

  // Verificar se houve erro no envio
  if (result && typeof result === 'object' && (result as any).error) {
    console.error("[Reply] Erro ao enviar mensagem:", result);
    return NextResponse.json({ 
      success: false, 
      error: "Erro ao enviar mensagem",
      details: result
    }, { status: 500 });
  }

  const message = await logWhatsAppMessage({
    phone,
    sessionId: waSession.id,
    clientId: waSession.clientId,
    direction: MessageDirection.OUTBOUND,
    sender: MessageSender.ADMIN,
    body: text,
    flowStage: "HANDOFF",
  });

  console.log("[Reply] Mensagem enviada com sucesso para", phone);

  return NextResponse.json({ success: true, data: message });
}
