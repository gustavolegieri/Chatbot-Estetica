import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ success: true, data: [] });
  const digits = query.replace(/\D/g, "");

  const [clients, appointments, conversations] = await Promise.all([
    prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          ...(digits ? [{ phone: { contains: digits } }] : []),
          { email: { contains: query, mode: "insensitive" } },
          { vehiclePlate: { contains: query, mode: "insensitive" } },
          { vehicleModel: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.appointment.findMany({
      where: {
        OR: [
          { client: { name: { contains: query, mode: "insensitive" } } },
          ...(digits ? [{ client: { phone: { contains: digits } } }] : []),
          { client: { vehiclePlate: { contains: query, mode: "insensitive" } } },
          { service: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: { client: true, service: true },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 5,
    }),
    prisma.whatsAppSession.findMany({
      where: {
        OR: [
          ...(digits ? [{ phone: { contains: digits } }] : []),
          { lastMessagePreview: { contains: query, mode: "insensitive" } },
          { client: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      include: { client: true },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
  ]);

  const data = [
    ...clients.map((client) => ({
      id: client.id,
      kind: "client" as const,
      title: client.name,
      subtitle: [formatPhone(client.phone), client.vehicleModel, client.vehiclePlate].filter(Boolean).join(" · "),
      meta: "Cliente",
      href: `/admin/clientes?search=${encodeURIComponent(client.phone)}`,
    })),
    ...appointments.map((appointment) => ({
      id: appointment.id,
      kind: "appointment" as const,
      title: `${appointment.client.name} · ${appointment.service.name}`,
      subtitle: `${format(appointment.date, "dd/MM/yyyy")} às ${appointment.startTime} · ${appointment.client.vehicleModel ?? formatPhone(appointment.client.phone)}`,
      meta: appointment.status === "IN_PROGRESS" ? "Em serviço" : appointment.status === "COMPLETED" ? "Concluído" : "Agenda",
      href: `/admin/agendamentos?date=${format(appointment.date, "yyyy-MM-dd")}`,
    })),
    ...conversations.map((conversation) => ({
      id: conversation.id,
      kind: "conversation" as const,
      title: conversation.client?.name ?? formatPhone(conversation.phone),
      subtitle: conversation.lastMessagePreview ?? "Conversa do WhatsApp",
      meta: conversation.handoffStatus === "PENDING" ? "Aguardando" : "WhatsApp",
      href: `/admin/atendimento?phone=${encodeURIComponent(conversation.phone)}`,
    })),
  ].slice(0, 12);

  return NextResponse.json({ success: true, data });
}
