import { NextRequest, NextResponse } from "next/server";
import { processAppointmentRemindersAndAutoCancel } from "@/lib/appointment-reminders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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

    const result = await processAppointmentRemindersAndAutoCancel();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Cron/Reminders] Erro não tratado, processo NÃO deve cair:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 200 });
  }
}
