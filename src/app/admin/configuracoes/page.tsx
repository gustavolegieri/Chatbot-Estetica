"use client";

import { useEffect, useState } from "react";
import { Save, MessageCircle } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface Settings {
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessHoursStart: string;
  businessHoursEnd: string;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
  slotDurationMin: number;
  workingDays: string;
  whatsappEnabled: boolean;
  whatsappWelcomeMsg: string;
  evolutionApiUrl: string | null;
  evolutionApiKey: string | null;
  evolutionInstanceName: string | null;
  pixKey: string | null;
  pixHolderName: string | null;
  pixBank: string | null;
  sessionResetMin: number;
  followupIdleMin: number;
  reminder4hMin: number;
  reminder30minMin: number;
  autoCancelMin: number;
}

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/configuracoes")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSettings(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day: number) {
    if (!settings) return;
    const days = settings.workingDays.split(",").map(Number);
    const updated = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    setSettings({ ...settings, workingDays: updated.join(",") });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");

    let res: Response;
    try {
      res = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch {
      setSaving(false);
      setMessage("Servidor offline. Rode npm run dev na porta 3000 e tente de novo.");
      return;
    }

    const data = await res.json();
    setSaving(false);
    setMessage(data.success ? "Configurações salvas com sucesso!" : data.error ?? "Erro ao salvar");
  }

  if (loading || !settings) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Carregando...</div>;
  }

  const workingDays = settings.workingDays.split(",").map(Number);

  return (
    <div>
      <AdminHeader title="Configurações" description="Configure seu negócio e integrações" />

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Dados do negócio</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nome do negócio</label>
              <input className="input" value={settings.businessName} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={settings.businessPhone ?? ""} onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço</label>
              <input className="input" value={settings.businessAddress ?? ""} onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Horário de funcionamento</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Abertura</label>
              <input type="time" className="input" value={settings.businessHoursStart} onChange={(e) => setSettings({ ...settings, businessHoursStart: e.target.value })} />
            </div>
            <div>
              <label className="label">Fechamento</label>
              <input type="time" className="input" value={settings.businessHoursEnd} onChange={(e) => setSettings({ ...settings, businessHoursEnd: e.target.value })} />
            </div>
            <div>
              <label className="label">Duração do slot (min)</label>
              <input
                type="number"
                min={15}
                className="input"
                value={settings.slotDurationMin}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setSettings({ ...settings, slotDurationMin: Number.isNaN(n) ? 30 : n });
                }}
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Dias de funcionamento</label>
            <div className="flex flex-wrap gap-2">
              {dayLabels.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    workingDays.includes(i) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Intervalo de almoço — início</label>
              <input
                type="time"
                className="input"
                value={settings.lunchBreakStart ?? ""}
                onChange={(e) => setSettings({ ...settings, lunchBreakStart: e.target.value || null })}
              />
            </div>
            <div>
              <label className="label">Intervalo de almoço — fim</label>
              <input
                type="time"
                className="input"
                value={settings.lunchBreakEnd ?? ""}
                onChange={(e) => setSettings({ ...settings, lunchBreakEnd: e.target.value || null })}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Feriados e bloqueios de dia inteiro ficam em{" "}
            <a href="/admin/feriados" className="text-brand-600 underline">
              Feriados
            </a>
            .
          </p>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Automações do bot</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Reset de sessão (min)</label>
              <input
                type="number"
                min={15}
                className="input"
                value={settings.sessionResetMin ?? 60}
                onChange={(e) =>
                  setSettings({ ...settings, sessionResetMin: parseInt(e.target.value, 10) || 60 })
                }
              />
            </div>
            <div>
              <label className="label">Follow-up inatividade (min)</label>
              <input
                type="number"
                min={5}
                className="input"
                value={settings.followupIdleMin ?? 10}
                onChange={(e) =>
                  setSettings({ ...settings, followupIdleMin: parseInt(e.target.value, 10) || 10 })
                }
              />
            </div>
            <div>
              <label className="label">Lembrete antes (min)</label>
              <input
                type="number"
                min={60}
                className="input"
                value={settings.reminder4hMin ?? 240}
                onChange={(e) =>
                  setSettings({ ...settings, reminder4hMin: parseInt(e.target.value, 10) || 240 })
                }
              />
            </div>
            <div>
              <label className="label">Aviso urgente (min antes)</label>
              <input
                type="number"
                min={10}
                className="input"
                value={settings.reminder30minMin ?? 30}
                onChange={(e) =>
                  setSettings({ ...settings, reminder30minMin: parseInt(e.target.value, 10) || 30 })
                }
              />
            </div>
            <div>
              <label className="label">Auto-cancelamento (min após aviso)</label>
              <input
                type="number"
                min={5}
                className="input"
                value={settings.autoCancelMin ?? 10}
                onChange={(e) =>
                  setSettings({ ...settings, autoCancelMin: parseInt(e.target.value, 10) || 10 })
                }
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Pagamento PIX (bot WhatsApp)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Chave PIX</label>
              <input className="input" placeholder="CPF, CNPJ, e-mail ou telefone" value={settings.pixKey ?? ""} onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })} />
            </div>
            <div>
              <label className="label">Nome do titular</label>
              <input className="input" value={settings.pixHolderName ?? ""} onChange={(e) => setSettings({ ...settings, pixHolderName: e.target.value })} />
            </div>
            <div>
              <label className="label">Banco</label>
              <input className="input" value={settings.pixBank ?? ""} onChange={(e) => setSettings({ ...settings, pixBank: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">WhatsApp (Evolution API)</h2>
          </div>

          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={settings.whatsappEnabled} onChange={(e) => setSettings({ ...settings, whatsappEnabled: e.target.checked })} />
            <span className="text-sm">WhatsApp habilitado</span>
          </label>

          <div className="space-y-4">
            <div>
              <label className="label">Mensagem de boas-vindas (legado)</label>
              <textarea className="input" rows={2} value={settings.whatsappWelcomeMsg} onChange={(e) => setSettings({ ...settings, whatsappWelcomeMsg: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">
                O bot usa os prompts em <a href="/admin/bot/prompts" className="text-brand-600 underline">Prompts Bot</a>.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">URL da Evolution API</label>
                <input className="input" placeholder="http://localhost:8080" value={settings.evolutionApiUrl ?? ""} onChange={(e) => setSettings({ ...settings, evolutionApiUrl: e.target.value })} />
              </div>
              <div>
                <label className="label">Nome da instância</label>
                <input className="input" placeholder="estetica" value={settings.evolutionInstanceName ?? ""} onChange={(e) => setSettings({ ...settings, evolutionInstanceName: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">API Key</label>
                <input className="input" type="password" value={settings.evolutionApiKey ?? ""} onChange={(e) => setSettings({ ...settings, evolutionApiKey: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Webhook URL: {typeof window !== "undefined" ? window.location.origin : ""}/api/whatsapp/webhook
            </p>
          </div>
        </div>

        {message && (
          <div className={`rounded-lg px-4 py-3 text-sm ${message.includes("sucesso") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </div>
  );
}
