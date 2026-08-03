import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncWasenderContacts, usableContactName } from "@/lib/wasender-contacts";

export const dynamic = "force-dynamic";

async function synchronizeIfNeeded(force: boolean) {
  const latest = await prisma.wasenderContact.aggregate({ _max: { lastSyncedAt: true } });
  const stale = !latest._max.lastSyncedAt || Date.now() - latest._max.lastSyncedAt.getTime() > 30 * 60_000;
  if (!force && !stale) return { refreshed: false, error: null as string | null };
  try {
    await syncWasenderContacts();
    return { refreshed: true, error: null as string | null };
  } catch (error) {
    return { refreshed: false, error: error instanceof Error ? error.message : "Falha ao sincronizar contatos" };
  }
}

async function listContacts(search: string) {
  const contacts = await prisma.wasenderContact.findMany({
    where: search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { notifyName: { contains: search, mode: "insensitive" } },
        { verifiedName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    } : undefined,
    orderBy: [{ name: "asc" }, { notifyName: "asc" }, { phone: "asc" }],
    take: 500,
  });
  const phones = contacts.map((contact) => contact.phone);
  const [clients, conversations] = await Promise.all([
    prisma.client.findMany({
      where: { phone: { in: phones } },
      select: { id: true, phone: true, name: true, vehicleModel: true, _count: { select: { appointments: true } } },
    }),
    prisma.whatsAppSession.findMany({
      where: { phone: { in: phones } },
      select: { phone: true, unreadCount: true, lastMessageAt: true, metadata: true },
    }),
  ]);
  const clientByPhone = new Map(clients.map((client) => [client.phone, client]));
  const conversationByPhone = new Map(conversations.map((conversation) => [conversation.phone, conversation]));
  return contacts.map((contact) => {
    const client = clientByPhone.get(contact.phone);
    const clientName = usableContactName(client?.name);
    const reliableClientName = clientName && !["cliente", "contato whatsapp"].includes(clientName.toLowerCase())
      ? clientName
      : null;
    const conversation = conversationByPhone.get(contact.phone);
    const metadata = conversation?.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? conversation.metadata as Record<string, unknown>
      : {};
    return {
      ...contact,
      displayName: reliableClientName || contact.verifiedName || contact.name || contact.notifyName || contact.phone,
      crmClient: client || null,
      unreadCount: conversation?.unreadCount || 0,
      lastMessageAt: conversation?.lastMessageAt || null,
      marketingConsent: metadata.marketingConsent === true,
      hasConversation: Boolean(conversation),
    };
  });
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const search = request.nextUrl.searchParams.get("search")?.trim() || "";
  const sync = await synchronizeIfNeeded(request.nextUrl.searchParams.get("refresh") === "true");
  const contacts = await listContacts(search);
  const latest = contacts.reduce<Date | null>((result, contact) => !result || contact.lastSyncedAt > result ? contact.lastSyncedAt : result, null);
  return NextResponse.json({ success: true, data: { contacts, total: contacts.length, lastSyncedAt: latest, sync } });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
  const sync = await synchronizeIfNeeded(true);
  const contacts = await listContacts("");
  return NextResponse.json({ success: !sync.error, data: { contacts, total: contacts.length, sync }, error: sync.error });
}
