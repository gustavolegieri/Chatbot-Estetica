import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";

export async function isPhoneBlocked(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const existing = await prisma.blockedPhone.findUnique({
    where: { phone: normalized },
    select: { id: true },
  });

  return !!existing;
}


