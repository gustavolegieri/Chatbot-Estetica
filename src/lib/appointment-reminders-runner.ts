import { processAppointmentRemindersAndAutoCancel } from "./appointment-reminders";

let lastRunAt = 0;
const MIN_INTERVAL_MS = 45_000;

/** Dispara lembretes e confirmações pendentes — chamado a cada mensagem recebida (bot 24/7). */
export function runAppointmentRemindersFromBot(): void {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;

  void processAppointmentRemindersAndAutoCancel().catch((err) => {
    console.error("[WhatsApp Bot] Erro ao processar lembretes de agendamento:", err);
  });
}
