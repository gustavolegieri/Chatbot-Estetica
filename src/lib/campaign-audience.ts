import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { isValidPrivateRecipient } from "@/lib/whatsapp-jid";

export type CampaignSelector = {
  type: "all" | "inactive" | "service" | "advanced";
  days?: number;
  serviceId?: string;
  authorizedOnly?: boolean;
  neighborhood?: string;
  vehicle?: string;
  unreadOnly?: boolean;
  handoffOnly?: boolean;
  leadSource?: string;
  appointmentStatus?: "any" | "scheduled" | "completed" | "none";
  interactedWithinDays?: number;
};

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function resolveCampaignAudience(selector: CampaignSelector) {
  const [clients, blocked] = await Promise.all([
    prisma.client.findMany({
      include: {
        appointments: { select: { date: true, status: true, serviceId: true } },
        whatsappSessions: { select: { metadata: true, unreadCount: true, handoffStatus: true, lastMessageAt: true } },
      },
      orderBy: { name: "asc" },
      take: 5_000,
    }),
    prisma.blockedPhone.findMany({ select: { phone: true } }),
  ]);
  const blockedPhones = new Set(blocked.map((item) => normalizePhone(item.phone)));
  const now = Date.now();

  const recipients = clients.filter((client) => {
    const phone = normalizePhone(client.phone);
    if (!isValidPrivateRecipient(phone) || blockedPhones.has(phone) || phone.startsWith("000") || phone.includes("test")) return false;
    const session = client.whatsappSessions[0];
    const metadata = metadataObject(session?.metadata);
    const authorized = metadata.marketingConsent === true;
    if (selector.authorizedOnly !== false && !authorized) return false;

    if (selector.type === "inactive") {
      const days = Math.max(1, Number(selector.days || 30));
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      if (client.appointments.some((appointment) => appointment.date.getTime() >= cutoff)) return false;
    }
    if (selector.type === "service" && selector.serviceId) {
      if (!client.appointments.some((appointment) => appointment.serviceId === selector.serviceId)) return false;
    }
    if (selector.type === "advanced") {
      if (selector.serviceId && !client.appointments.some((appointment) => appointment.serviceId === selector.serviceId)) return false;
      if (selector.neighborhood && !client.address?.toLowerCase().includes(selector.neighborhood.toLowerCase())) return false;
      if (selector.vehicle && !client.vehicleModel?.toLowerCase().includes(selector.vehicle.toLowerCase())) return false;
      if (selector.unreadOnly && !(session && session.unreadCount > 0)) return false;
      if (selector.handoffOnly && !(session && ["PENDING", "IN_PROGRESS"].includes(session.handoffStatus))) return false;
      if (selector.leadSource && String(metadata.leadSource || "").toLowerCase() !== selector.leadSource.toLowerCase()) return false;
      if (selector.interactedWithinDays) {
        const cutoff = now - Math.max(1, selector.interactedWithinDays) * 24 * 60 * 60 * 1000;
        if (!session?.lastMessageAt || session.lastMessageAt.getTime() < cutoff) return false;
      }
      if (selector.appointmentStatus === "none" && client.appointments.length > 0) return false;
      if (selector.appointmentStatus === "completed" && !client.appointments.some((appointment) => appointment.status === "COMPLETED")) return false;
      if (selector.appointmentStatus === "scheduled" && !client.appointments.some((appointment) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status))) return false;
    }
    return true;
  }).map((client) => ({ phone: normalizePhone(client.phone), name: client.name }));

  return {
    recipients: [...new Map(recipients.map((item) => [item.phone, item])).values()],
    totalClients: clients.length,
    blocked: blockedPhones.size,
  };
}
