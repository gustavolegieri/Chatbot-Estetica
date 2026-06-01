import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAvailableSlots } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");

  if (!date || !serviceId) {
    return NextResponse.json({ success: false, error: "date e serviceId são obrigatórios" }, { status: 400 });
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return NextResponse.json({ success: false, error: "Serviço não encontrado" }, { status: 404 });
  }

  const slots = await getAvailableSlots(date, service.durationMin);
  return NextResponse.json({ success: true, data: slots });
}
