import { NextRequest, NextResponse } from "next/server";
import { sendDueAppointmentReminders } from "@/lib/appointment-reminders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const token = auth?.replace(/^Bearer\s+/i, "") ?? querySecret;

  if (token !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const result = await sendDueAppointmentReminders();
  return NextResponse.json({ ok: true, ...result });
}
