"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Save, BellRing, Mail } from "lucide-react";

const defaultSettings = {
  notifyNewAppointment: true,
  notifyClientHandoff: true,
  notifyCancelledAppointment: true,
  notifyMonthlyGoal: false,
  monthlyGoalAmount: "",
  notifyByEmail: false,
  notifyEmailAddress: "",
};

export default function NotificacoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  useEffect(() => {
    let mounted = true;
    fetch("/api/notificacoes")
      .then((r) => r.json())
      .then((res) => {
        if (!mounted) return;
        if (res.success && res.data) {
          setSettings({
            ...defaultSettings,
            ...res.data,
            monthlyGoalAmount: res.data.monthlyGoalAmount ?? "",
            notifyEmailAddress: res.data.notifyEmailAddress ?? "",
          });
        }
      })
      .catch(() => {
        if (mounted) {
          setMessageTone("error");
          setMessage("Não foi possível carregar as preferências. Tente novamente.");
        }
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  function toggle(key: string) {
    setSettings((prev: any) => ({ ...prev, [key]: !prev[key] }));
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
        monthlyGoalAmount: settings.monthlyGoalAmount ? Number(settings.monthlyGoalAmount) : null,
        notifyByEmail: settings.notifyByEmail,
        notifyEmailAddress: settings.notifyEmailAddress,
      };

      const res = await fetch("/api/notificacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessageTone("error");
        setMessage(data.error || "Erro ao salvar as notificações.");
      } else {
        setMessageTone("success");
        setMessage("Preferências salvas com sucesso.");
      }
    } catch {
      setMessageTone("error");
      setMessage("Erro de conexão ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-500">Carregando configurações...</div>;

  return (
    <div>
      <AdminHeader title="Notificações" description="Defina quando e por qual canal avisar o time." />

      {message && (
        <div className={`mb-4 rounded border px-4 py-2 ${messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-emerald-600" />
            <h2 className="text-lg font-semibold">Eventos</h2>
          </div>
          <div className="space-y-3">
            {[
              ["notifyNewAppointment", "Novo agendamento feito pelo bot"],
              ["notifyClientHandoff", "Cliente pediu para falar com o dono"],
              ["notifyCancelledAppointment", "Cancelamento de agendamento"],
              ["notifyMonthlyGoal", "Notificar meta de faturamento"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-start gap-3 rounded border border-slate-200 p-3">
                <input type="checkbox" checked={!!settings[key]} onChange={() => toggle(key)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
            {settings.notifyMonthlyGoal && (
              <div className="rounded border border-dashed border-slate-300 p-3">
                <label className="label">Meta mensal (R$)</label>
                <input className="input" type="number" min="0" step="0.01" value={settings.monthlyGoalAmount ?? ""} onChange={(e) => setSettings({ ...settings, monthlyGoalAmount: e.target.value })} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-4 w-4 text-sky-600" />
            <h2 className="text-lg font-semibold">Canais</h2>
          </div>
          <label className="flex items-start gap-3 rounded border border-slate-200 p-3">
            <input type="checkbox" checked={!!settings.notifyByEmail} onChange={() => toggle("notifyByEmail")} />
            <span className="text-sm">Enviar também por e-mail</span>
          </label>

          {settings.notifyByEmail && (
            <div className="mt-3 rounded border border-dashed border-slate-300 p-3">
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
