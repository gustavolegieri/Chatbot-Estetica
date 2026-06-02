import { NextRequest, NextResponse } from "next/server";
import { processAppointmentRemindersAndAutoCancel } from "@/lib/appointment-reminders";
import { sendIdleSessionRecoveries } from "@/lib/whatsapp-followup";
import { resetAllExpiredSessions } from "@/lib/whatsapp-session-reset";

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

  const reset = await resetAllExpiredSessions();
  const followup = await sendIdleSessionRecoveries();
  const reminders = await processAppointmentRemindersAndAutoCancel();
  return NextResponse.json({ ok: true, ...reset, ...followup, reminders });
}
