import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

export async function POST(_request: Request, { params }: { params: Promise<{ phone: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const phone = normalizePhone(decodeURIComponent((await params).phone));
  const contact = await prisma.wasenderContact.findUnique({ where: { phone } });
  if (!contact) return NextResponse.json({ success: false, error: "Contato sincronizado não encontrado" }, { status: 404 });
  const name = contact.verifiedName || contact.name || contact.notifyName || "Contato WhatsApp";
  const client = await prisma.client.upsert({
    where: { phone },
    create: { phone, name, notes: "Contato importado da agenda conectada à WASender." },
    update: { name: name === "Contato WhatsApp" ? undefined : name },
  });
  const conversation = await prisma.whatsAppSession.upsert({
    where: { phone },
    create: {
      phone,
      clientId: client.id,
      lastStage: "ETAPA1_AWAITING_NAME",
      inboxArchivedAt: new Date(),
      metadata: { stage: "ETAPA1_AWAITING_NAME", customerName: name, importedFromWasender: true },
    },
    update: { clientId: client.id },
  });
  return NextResponse.json({ success: true, data: { phone, conversationId: conversation.id, clientId: client.id } });
}
