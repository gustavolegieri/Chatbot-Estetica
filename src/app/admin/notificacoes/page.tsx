"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Bell, Mail, Save, CheckCircle2, AlertCircle, DollarSign, Target, RefreshCw } from "lucide-react";

const defaultSettings = {
  notifyNewAppointment: true,
  notifyClientHandoff: true,
  notifyCancelledAppointment: true,
  notifyMonthlyGoal: false,
  monthlyGoalAmount: "",
  notifyByEmail: false,
  notifyEmailAddress: "",
};

const toggleItems = [
  { key: "notifyNewAppointment", label: "Novo agendamento pelo WhatsApp", desc: "Avisa quando um cliente agenda pelo bot", icon: "📅" },
  { key: "notifyClientHandoff", label: "Cliente pediu atendente", desc: "Cliente solicitou falar com você", icon: "💬" },
  { key: "notifyCancelledAppointment", label: "Cancelamento de agendamento", desc: "Cliente cancelou um horário marcado", icon: "❌" },
  { key: "notifyMonthlyGoal", label: "Avisar meta de faturamento", desc: "Notifica quando a meta do mês for atingida", icon: "🎯" },
];

export default function NotificacoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

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
        if (mounted) setMessage({ text: "Não foi possível carregar as configurações.", type: "error" });
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
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
        setMessage({ text: data.error || "Erro ao salvar as notificações.", type: "error" });
      } else {
        setMessage({ text: "Preferências salvas com sucesso! ✅", type: "success" });
      }
    } catch {
      setMessage({ text: "Erro de conexão ao salvar.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <AdminHeader title="Notificações" description="Escolha quando e como ser avisado" />
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            <span>Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Notificações" description="Escolha quando e como ser avisado sobre eventos importantes" />

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg ${
          message.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Eventos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Bell className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Eventos para notificar</h2>
              <p className="text-sm text-slate-500">Ative ou desative cada tipo de aviso</p>
            </div>
          </div>

          <div className="space-y-3">
            {toggleItems.map(({ key, label, desc, icon }) => (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 p-4 transition ${
                  settings[key]
                    ? "border-brand-200 bg-brand-50/50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm">
                  {icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
                <div
                  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${
                    settings[key] ? "bg-brand-500" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      settings[key] ? "translate-x-5" : ""
                    }`}
                  />
                  <input type="checkbox" checked={!!settings[key]} onChange={() => toggle(key)} className="hidden" />
                </div>
              </label>
            ))}

            {settings.notifyMonthlyGoal && (
              <div className="ml-16 mt-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/30 p-5">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-brand-500" />
                  <label className="text-sm font-semibold text-slate-700">Meta mensal (R$)</label>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-slate-400" />
                  <input
                    className="w-full max-w-xs rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    type="number" min="0" step="0.01"
                    placeholder="Ex: 10000"
                    value={settings.monthlyGoalAmount ?? ""}
                    onChange={(e) => setSettings({ ...settings, monthlyGoalAmount: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canais */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
              <Mail className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Canal de envio</h2>
              <p className="text-sm text-slate-500">Como você quer receber os avisos</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-slate-200 bg-white p-4 transition hover:border-slate-300">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-lg shadow-sm">📧</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">Enviar também por e-mail</p>
              <p className="text-xs text-slate-500">Além do WhatsApp, receba as notificações no e-mail</p>
            </div>
            <div className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${settings.notifyByEmail ? "bg-brand-500" : "bg-slate-300"}`}>
              <div className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${settings.notifyByEmail ? "translate-x-5" : ""}`} />
              <input type="checkbox" checked={!!settings.notifyByEmail} onChange={() => toggle("notifyByEmail")} className="hidden" />
            </div>
          </label>

          {settings.notifyByEmail && (
            <div className="ml-16 mt-3">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Seu e-mail</label>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-slate-400" />
                <input
                  className="w-full max-w-md rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  type="email" placeholder="seu@email.com"
                  value={settings.notifyEmailAddress ?? ""}
                  onChange={(e) => setSettings({ ...settings, notifyEmailAddress: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Salvar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="h-4 w-4" /> Salvar configurações</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}