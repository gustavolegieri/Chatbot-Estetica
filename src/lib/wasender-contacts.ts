import { prisma } from "@/lib/prisma";
import { phoneFromPrivateJid } from "@/lib/whatsapp-jid";

const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

type RemoteContact = {
  jid?: string;
  id?: string;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
  imgUrl?: string | null;
  status?: string | null;
  lid?: string | null;
};

function contactPhone(contact: RemoteContact) {
  const source = contact.jid || contact.id || "";
  const raw = source.includes("@") ? source : `${source}@s.whatsapp.net`;
  // `@lid` é um identificador interno do WhatsApp, não um telefone.
  const phone = phoneFromPrivateJid(raw);
  const systemName = (contact.name || contact.notify || contact.verifiedName || "").trim().toLowerCase();
  if (!phone || systemName === "meta ai" || systemName === "whatsapp") return null;
  return phone;
}

export function usableContactName(value?: string | null) {
  const name = value?.trim();
  if (!name || name.includes("∙") || name.includes("•")) return null;
  if (["meta ai", "whatsapp"].includes(name.toLowerCase())) return null;
  return name;
}

export async function applyWasenderContactEvents(input: unknown) {
  const contacts = (Array.isArray(input) ? input : [input]).filter(
    (item): item is RemoteContact => Boolean(item && typeof item === "object")
  );
  let updated = 0;

  for (const contact of contacts) {
    const phone = contactPhone(contact);
    if (!phone) continue;
    const jidSource = contact.jid || contact.id || `${phone}@s.whatsapp.net`;
    const name = usableContactName(contact.name);
    const notifyName = usableContactName(contact.notify);
    const verifiedName = usableContactName(contact.verifiedName);

    await prisma.wasenderContact.upsert({
      where: { phone },
      create: {
        phone,
        jid: jidSource,
        name,
        notifyName,
        verifiedName,
        profileUrl: contact.imgUrl || null,
        about: contact.status || null,
        lastSyncedAt: new Date(),
      },
      update: {
        jid: jidSource,
        name: name ?? undefined,
        notifyName: notifyName ?? undefined,
        verifiedName: verifiedName ?? undefined,
        profileUrl: contact.imgUrl || undefined,
        about: contact.status || undefined,
        lastSyncedAt: new Date(),
      },
    });
    updated += 1;
  }

  return updated;
}

export async function syncWasenderContacts() {
  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) throw new Error("WASENDER_API_KEY não configurada");

  const contacts: RemoteContact[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(`${WASENDER_BASE}/contacts?paginated=true&page=${page}&limit=100`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || `WASender respondeu HTTP ${response.status}`);
    }

    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    contacts.push(...items);
    const pagination = payload?.data?.pagination || payload?.pagination;
    const totalPages = Number(pagination?.lastPage || pagination?.totalPages || pagination?.total_pages || 0);
    const hasMore = pagination?.hasMore ?? pagination?.has_more;
    if (!items.length || (totalPages > 0 && page >= totalPages) || hasMore === false || items.length < 100) break;
  }

  const now = new Date();
  const normalized = new Map<string, RemoteContact>();
  for (const contact of contacts) {
    const phone = contactPhone(contact);
    if (phone) normalized.set(phone, contact);
  }

  const entries = [...normalized.entries()];
  if (contacts.length > 0 && entries.length === 0) {
    throw new Error("A WASender não retornou nenhum contato telefônico válido");
  }
  for (let offset = 0; offset < entries.length; offset += 40) {
    const chunk = entries.slice(offset, offset + 40);
    await prisma.$transaction(chunk.map(([phone, contact]) => prisma.wasenderContact.upsert({
      where: { phone },
      create: {
        phone,
        jid: contact.jid || contact.id || null,
        name: usableContactName(contact.name),
        notifyName: usableContactName(contact.notify),
        verifiedName: usableContactName(contact.verifiedName),
        profileUrl: contact.imgUrl || null,
        about: contact.status || null,
        lastSyncedAt: now,
      },
      update: {
        jid: contact.jid || contact.id || undefined,
        name: usableContactName(contact.name),
        notifyName: usableContactName(contact.notify),
        verifiedName: usableContactName(contact.verifiedName),
        profileUrl: contact.imgUrl || undefined,
        about: contact.status || undefined,
        lastSyncedAt: now,
      },
    })));
  }

  const removed = await prisma.wasenderContact.deleteMany({
    where: { phone: { notIn: entries.map(([phone]) => phone) } },
  });

  return {
    received: contacts.length,
    synced: entries.length,
    rejected: contacts.length - entries.length,
    removed: removed.count,
    syncedAt: now,
  };
}
