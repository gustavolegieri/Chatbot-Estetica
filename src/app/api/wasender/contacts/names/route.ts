import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { usableContactName } from "@/lib/wasender-contacts";
import { isValidPrivateRecipient } from "@/lib/whatsapp-jid";

const bodySchema = z.object({
  contacts: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().min(8).max(40),
  })).min(1).max(2000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Lista de contatos inválida" }, { status: 400 });
  }

  const namesByPhone = new Map<string, string>();
  for (const item of parsed.data.contacts) {
    let phone = normalizePhone(item.phone);
    // Agendas brasileiras frequentemente salvam (DDD) + número, sem o DDI 55.
    if (phone.startsWith("0") && (phone.length === 11 || phone.length === 12)) phone = phone.slice(1);
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    const name = usableContactName(item.name);
    if (name && isValidPrivateRecipient(phone)) namesByPhone.set(phone, name);
  }

  const phones = [...namesByPhone.keys()];
  const existing = await prisma.wasenderContact.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  });
  const existingPhones = new Set(existing.map((contact) => contact.phone));
  const updates = [...namesByPhone.entries()].filter(([phone]) => existingPhones.has(phone));

  for (let offset = 0; offset < updates.length; offset += 50) {
    await prisma.$transaction(
      updates.slice(offset, offset + 50).map(([phone, name]) => prisma.wasenderContact.update({
        where: { phone },
        data: { name, lastSyncedAt: new Date() },
      }))
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      received: parsed.data.contacts.length,
      valid: namesByPhone.size,
      matched: updates.length,
    },
  });
}
