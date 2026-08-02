"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Link2,
  MessageCircle,
  Save,
  Settings2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
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
  testModeEnabled: boolean;
  testModePhone: string | null;
}

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function SectionTitle({ icon: Icon, eyebrow, title, description }: { icon: typeof Building2; eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-5 flex gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-900/35 text-brand-300">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-400/80">{eyebrow}</p>
        <h2 className="mt-0.5 font-serif text-lg font-semibold text-brand-100">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) setSettings(result.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const workingDays = useMemo(
    () => (settings?.workingDays ? settings.workingDays.split(",").map(Number) : []),
    [settings?.workingDays]
  );

  function toggleDay(day: number) {
    if (!settings) return;
    const updated = workingDays.includes(day)
      ? workingDays.filter((currentDay) => currentDay !== day)
      : [...workingDays, day].sort();
    setSettings({ ...settings, workingDays: updated.join(",") });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");

    let response: Response;
    try {
      response = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch {
      setSaving(false);
      setMessage("Servidor offline. Rode npm run dev na porta 3000 e tente de novo.");
      return;
    }

    const data = await response.json();
    setSaving(false);
    setMessage(data.success ? "Configurações salvas com sucesso!" : data.error ?? "Erro ao salvar configurações.");
  }

  if (loading || !settings) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Carregando central de operações...</div>;
  }

  const hasApiConnection = Boolean(settings.evolutionApiUrl && settings.evolutionInstanceName && settings.evolutionApiKey);
  const messageIsSuccess = message.toLowerCase().includes("sucesso");

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Central de operações"
        eyebrow="Configuração do negócio"
        icon={Settings2}
        description="Controle a agenda, automações, pagamentos e a comunicação oficial pelo WhatsApp."
        actions={
          <button type="submit" form="settings-form" disabled={saving} className="btn-primary">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        }
      />

      {message && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${messageIsSuccess ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-red-400/25 bg-red-500/10 text-red-200"}`}>
          {messageIsSuccess ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <form id="settings-form" onSubmit={handleSave} className="space-y-6">
          <section className="rounded-2xl border border-white/[0.075] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={Building2} eyebrow="Identidade" title="Dados do negócio" description="Estas informações aparecem nos seus canais de atendimento e comunicados." />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label">Nome do negócio</label><input className="input" value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} /></div>
              <div><label className="label">Telefone comercial</label><input className="input" inputMode="tel" placeholder="(11) 99999-9999" value={settings.businessPhone ?? ""} onChange={(event) => setSettings({ ...settings, businessPhone: event.target.value })} /></div>
              <div><label className="label">Endereço</label><input className="input" placeholder="Rua, número e bairro" value={settings.businessAddress ?? ""} onChange={(event) => setSettings({ ...settings, businessAddress: event.target.value })} /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.075] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={CalendarDays} eyebrow="Disponibilidade" title="Agenda e horários" description="Defina quando o bot pode oferecer horários e a cadência da agenda." />
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label">Abertura</label><input type="time" className="input" value={settings.businessHoursStart} onChange={(event) => setSettings({ ...settings, businessHoursStart: event.target.value })} /></div>
              <div><label className="label">Fechamento</label><input type="time" className="input" value={settings.businessHoursEnd} onChange={(event) => setSettings({ ...settings, businessHoursEnd: event.target.value })} /></div>
              <div><label className="label">Intervalo de slots (min)</label><input type="number" min={15} className="input" value={settings.slotDurationMin} onChange={(event) => { const value = parseInt(event.target.value, 10); setSettings({ ...settings, slotDurationMin: Number.isNaN(value) ? 30 : value }); }} /></div>
            </div>
            <div className="mt-5 border-t border-white/[0.06] pt-5">
              <label className="label">Dias de funcionamento</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {dayLabels.map((label, index) => {
                  const active = workingDays.includes(index);
                  return <button key={label} type="button" onClick={() => toggleDay(index)} className={`min-w-11 rounded-lg border px-3 py-2 text-sm font-semibold transition ${active ? "border-brand-400/50 bg-brand-500 text-surface-950 shadow-[0_6px_18px_rgba(212,175,55,0.14)]" : "border-white/[0.08] bg-surface-800 text-slate-400 hover:border-brand-500/35 hover:text-brand-200"}`}>{label}</button>;
                })}
              </div>
            </div>
            <div className="mt-5 grid gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-2">
              <div><label className="label">Pausa para almoço — início</label><input type="time" className="input" value={settings.lunchBreakStart ?? ""} onChange={(event) => setSettings({ ...settings, lunchBreakStart: event.target.value || null })} /></div>
              <div><label className="label">Pausa para almoço — fim</label><input type="time" className="input" value={settings.lunchBreakEnd ?? ""} onChange={(event) => setSettings({ ...settings, lunchBreakEnd: event.target.value || null })} /></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Feriados e bloqueios de dia inteiro são gerenciados em <a href="/admin/feriados" className="font-medium text-brand-300 hover:text-brand-200">Feriados</a>.</p>
          </section>

          <section className="rounded-2xl border border-white/[0.075] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={Bot} eyebrow="Orquestração" title="Automações do assistente" description="Ajuste o ritmo das conversas e dos lembretes sem alterar o fluxo principal." />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><label className="label">Reset de sessão (min)</label><input type="number" min={15} className="input" value={settings.sessionResetMin ?? 60} onChange={(event) => setSettings({ ...settings, sessionResetMin: parseInt(event.target.value, 10) || 60 })} /></div>
              <div><label className="label">Follow-up por inatividade (min)</label><input type="number" min={5} className="input" value={settings.followupIdleMin ?? 10} onChange={(event) => setSettings({ ...settings, followupIdleMin: parseInt(event.target.value, 10) || 10 })} /></div>
              <div><label className="label">Lembrete antecipado (min)</label><input type="number" min={60} className="input" value={settings.reminder4hMin ?? 240} onChange={(event) => setSettings({ ...settings, reminder4hMin: parseInt(event.target.value, 10) || 240 })} /></div>
              <div><label className="label">Aviso urgente (min antes)</label><input type="number" min={10} className="input" value={settings.reminder30minMin ?? 30} onChange={(event) => setSettings({ ...settings, reminder30minMin: parseInt(event.target.value, 10) || 30 })} /></div>
              <div><label className="label">Auto-cancelamento (min após aviso)</label><input type="number" min={5} className="input" value={settings.autoCancelMin ?? 10} onChange={(event) => setSettings({ ...settings, autoCancelMin: parseInt(event.target.value, 10) || 10 })} /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-400/[0.14] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={MessageCircle} eyebrow="Canal oficial" title="WhatsApp e integração" description="Mantenha o canal de atendimento conectado e o bot alinhado ao seu catálogo." />
            <label className="mb-5 flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-surface-900/55 p-4">
              <span><span className="block text-sm font-semibold text-slate-100">WhatsApp habilitado</span><span className="mt-1 block text-xs text-slate-500">Permite que o assistente responda novas mensagens.</span></span>
              <input type="checkbox" checked={settings.whatsappEnabled} onChange={(event) => setSettings({ ...settings, whatsappEnabled: event.target.checked })} className="h-5 w-5 accent-[#d4af37]" />
            </label>
            <div className="space-y-4">
              <div><label className="label">Mensagem de boas-vindas (legado)</label><textarea className="input resize-y" rows={3} value={settings.whatsappWelcomeMsg} onChange={(event) => setSettings({ ...settings, whatsappWelcomeMsg: event.target.value })} /><p className="mt-1.5 text-xs text-slate-500">As mensagens atuais do fluxo são gerenciadas em <a href="/admin/bot/prompts" className="font-medium text-brand-300 hover:text-brand-200">Prompts do Bot</a>.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label">URL da Evolution API</label><input className="input" placeholder="https://sua-api.com" value={settings.evolutionApiUrl ?? ""} onChange={(event) => setSettings({ ...settings, evolutionApiUrl: event.target.value })} /></div>
                <div><label className="label">Nome da instância</label><input className="input" placeholder="estetica" value={settings.evolutionInstanceName ?? ""} onChange={(event) => setSettings({ ...settings, evolutionInstanceName: event.target.value })} /></div>
                <div className="relative sm:col-span-2"><label className="label">API Key</label><input className="input pr-11" type={showApiKey ? "text" : "password"} autoComplete="new-password" value={settings.evolutionApiKey ?? ""} onChange={(event) => setSettings({ ...settings, evolutionApiKey: event.target.value })} /><button type="button" onClick={() => setShowApiKey((visible) => !visible)} className="absolute bottom-2.5 right-3 rounded-md p-1 text-slate-500 transition hover:bg-surface-700 hover:text-brand-200" aria-label={showApiKey ? "Ocultar API Key" : "Mostrar API Key"}>{showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-white/[0.06] bg-surface-900/40 px-3 py-2 text-xs text-slate-500"><Link2 className="h-3.5 w-3.5 text-brand-400" /><span>Webhook:</span><code className="break-all text-brand-200">{typeof window !== "undefined" ? window.location.origin : ""}/api/whatsapp/webhook</code></div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.075] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={WalletCards} eyebrow="Recebimento" title="Pagamento via PIX" description="Dados usados pelo bot quando o cliente solicita instruções de pagamento." />
            <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label className="label">Chave PIX</label><input className="input" placeholder="CPF, CNPJ, e-mail ou telefone" value={settings.pixKey ?? ""} onChange={(event) => setSettings({ ...settings, pixKey: event.target.value })} /></div><div><label className="label">Nome do titular</label><input className="input" value={settings.pixHolderName ?? ""} onChange={(event) => setSettings({ ...settings, pixHolderName: event.target.value })} /></div><div><label className="label">Banco</label><input className="input" value={settings.pixBank ?? ""} onChange={(event) => setSettings({ ...settings, pixBank: event.target.value })} /></div></div>
          </section>

          <section className="rounded-2xl border border-amber-400/[0.16] bg-surface-850/75 p-5 shadow-[0_16px_44px_rgba(0,0,0,0.16)] sm:p-6">
            <SectionTitle icon={ShieldCheck} eyebrow="Ambiente protegido" title="Modo de teste" description="Restrinja o bot a um número autorizado antes de publicar alterações no canal." />
            <div className="rounded-xl border border-amber-300/15 bg-amber-400/[0.07] px-4 py-3 text-sm leading-6 text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-300" />Quando ativo, mensagens de outros números são ignoradas pelo bot.</div>
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-surface-900/55 p-4"><span><span className="block text-sm font-semibold text-slate-100">Ativar modo de teste</span><span className="mt-1 block text-xs text-slate-500">Use apenas enquanto valida o fluxo.</span></span><input type="checkbox" checked={settings.testModeEnabled ?? false} onChange={(event) => setSettings({ ...settings, testModeEnabled: event.target.checked })} className="h-5 w-5 accent-[#d4af37]" /></label>
            <div className="mt-4"><label className="label">Telefone autorizado</label><input type="text" inputMode="numeric" className="input" placeholder="Ex.: 5511999998888" value={settings.testModePhone ?? ""} onChange={(event) => setSettings({ ...settings, testModePhone: event.target.value.replace(/\D/g, "") || null })} disabled={!settings.testModeEnabled} /><p className="mt-1.5 text-xs text-slate-500">Inclua 55 + DDD, sem +, espaços ou traços.</p>{settings.testModePhone && settings.testModePhone.length >= 12 && <p className="mt-1.5 text-xs font-medium text-emerald-300">Número pronto para envio: +{settings.testModePhone}</p>}</div>
          </section>

          <div className="flex flex-col-reverse gap-2 pb-2 sm:flex-row sm:justify-end"><button type="submit" disabled={saving} className="btn-primary"><Save className="mr-2 h-4 w-4" />{saving ? "Salvando..." : "Salvar alterações"}</button></div>
        </form>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-surface-850/80 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
            <div className="border-b border-white/[0.06] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-400/80">Status do ambiente</p><h2 className="mt-1 font-serif text-lg font-semibold text-brand-100">Pronto para operar</h2></div>
            <div className="divide-y divide-white/[0.06]">
              <div className="flex items-start gap-3 p-4"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${settings.whatsappEnabled && hasApiConnection ? "bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.65)]" : "bg-amber-400"}`} /><div><p className="text-sm font-semibold text-slate-200">Canal WhatsApp</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{settings.whatsappEnabled ? hasApiConnection ? "Habilitado e configurado" : "Habilitado, conexão incompleta" : "Desabilitado"}</p></div></div>
              <div className="flex items-start gap-3 p-4"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /><div><p className="text-sm font-semibold text-slate-200">Horário de atendimento</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{settings.businessHoursStart} às {settings.businessHoursEnd} · {workingDays.length} dias ativos</p></div></div>
              <div className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /><div><p className="text-sm font-semibold text-slate-200">Ambiente de teste</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{settings.testModeEnabled ? "Protegido por número autorizado" : "Produção liberada"}</p></div></div>
            </div>
          </section>
          <section className="rounded-2xl border border-brand-500/15 bg-brand-900/[0.14] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-400/80">Boa prática</p><p className="mt-2 text-sm leading-6 text-slate-300">Salve as alterações antes de testar o fluxo. Em seguida, valide a conversa em <a className="font-medium text-brand-200 hover:text-brand-100" href="/admin/test-bot">Teste do Bot</a>.</p></section>
        </aside>
      </div>
    </div>
  );
}
