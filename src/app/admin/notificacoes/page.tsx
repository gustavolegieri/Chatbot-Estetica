"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Save } from "lucide-react";

export default function NotificacoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notificacoes")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setSettings(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setSettings({ ...settings, [key]: !settings[key] });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body = {
        notifyNewAppointment: settings.notifyNewAppointment,
        notifyClientHandoff: settings.notifyClientHandoff,
        notifyCancelledAppointment: settings.notifyCancelledAppointment,
        notifyMonthlyGoal: settings.notifyMonthlyGoal,
        monthlyGoalAmount: settings.monthlyGoalAmount ? Number(settings.monthlyGoalAmount) : undefined,
        notifyByEmail: settings.notifyByEmail,
        notifyEmailAddress: settings.notifyEmailAddress,
      };

      const res = await fetch("/api/notificacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setMessage(data.error || "Erro ao salvar");
      else setMessage("Configurações salvas");
    } catch {
      setMessage("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-500">Carregando...</div>;

  return (
    <div>
      <AdminHeader title="Notificações" description="Configure canais e eventos de notificação" />

      {message && <div className="mb-4 rounded border bg-emerald-950/20 px-4 py-2 text-emerald-200">{message}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Eventos</h2>
          <div className="space-y-3">
            <label className="inline-flex items-center gap-3">
              <input type="checkbox" checked={!!settings.notifyNewAppointment} onChange={() => toggle("notifyNewAppointment")} />
              <span className="text-sm">Novo agendamento feito pelo bot</span>
            </label>

            <label className="inline-flex items-center gap-3">
              <input type="checkbox" checked={!!settings.notifyClientHandoff} onChange={() => toggle("notifyClientHandoff")} />
              <span className="text-sm">Cliente pediu para falar com o dono</span>
            </label>

            <label className="inline-flex items-center gap-3">
              <input type="checkbox" checked={!!settings.notifyCancelledAppointment} onChange={() => toggle("notifyCancelledAppointment")} />
              <span className="text-sm">Cancelamento de agendamento</span>
            </label>

            <label className="inline-flex items-center gap-3">
              <input type="checkbox" checked={!!settings.notifyMonthlyGoal} onChange={() => toggle("notifyMonthlyGoal")} />
              <span className="text-sm">Notificar meta de faturamento</span>
            </label>
            {settings.notifyMonthlyGoal && (
              <div className="mt-2">
                <label className="label">Meta mensal (R$)</label>
                <input className="input" type="number" value={settings.monthlyGoalAmount ?? ""} onChange={(e) => setSettings({ ...settings, monthlyGoalAmount: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Canais</h2>
          <label className="inline-flex items-center gap-3">
            <input type="checkbox" checked={!!settings.notifyByEmail} onChange={() => toggle("notifyByEmail")} />
            <span className="text-sm">Enviar também por e-mail</span>
          </label>

          {settings.notifyByEmail && (
            <div className="mt-3">
              <label className="label">E-mail para notificações</label>
              <input className="input" type="email" value={settings.notifyEmailAddress ?? ""} onChange={(e) => setSettings({ ...settings, notifyEmailAddress: e.target.value })} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
