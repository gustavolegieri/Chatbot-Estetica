"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, MapPin, ShieldCheck, Sparkles } from "lucide-react";

const initialForm = {
  name: "",
  phone: "",
  neighborhood: "",
  vehicle: "",
  service: "avaliacao",
  consent: false,
  website: "",
};

export default function JundiaiLeadPage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState<string | null | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const origin = new URLSearchParams(window.location.search).get("origem") || "pagina-jundiai";
      const response = await fetch("/api/leads/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: origin }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Não foi possível enviar seus dados.");
      setWhatsappUrl(payload.data?.whatsappUrl ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar seus dados.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,175,55,0.15),transparent_30%),radial-gradient(circle_at_85%_75%,rgba(212,175,55,0.08),transparent_34%)]" />
      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-14">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-garagem-do-ka.png" alt="Garagem do Ka" width={58} height={58} className="h-14 w-14 rounded-full object-cover ring-1 ring-brand-300/40" priority />
            <div><p className="font-serif text-lg font-bold text-brand-100">Garagem do Ka</p><p className="text-xs uppercase tracking-[0.18em] text-brand-400">Estética automotiva</p></div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1.5 text-xs text-brand-200 sm:flex"><MapPin className="h-3.5 w-3.5" /> Jundiaí e região</span>
        </header>

        <div className="grid items-center gap-12 py-12 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
          <section>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-200"><Sparkles className="h-3.5 w-3.5" /> Avaliação personalizada pelo WhatsApp</span>
            <h1 className="mt-6 max-w-3xl font-serif text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">Descubra o cuidado ideal para o seu carro.</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">Conte o que seu veículo precisa. Nossa equipe avalia seu caso, indica o serviço adequado e ajuda você a encontrar um horário em Jundiaí.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["Atendimento local", "Orientação personalizada", "Agendamento simplificado"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-sm text-slate-300"><CheckCircle2 className="h-4 w-4 shrink-0 text-brand-300" />{item}</div>)}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface-900/90 p-5 shadow-[0_30px_80px_rgba(0,0,0,.45)] backdrop-blur sm:p-7">
            {whatsappUrl !== undefined ? (
              <div className="py-8 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/25"><CheckCircle2 className="h-8 w-8" /></span>
                <h2 className="mt-5 font-serif text-2xl font-bold text-white">Recebemos seu interesse!</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">Seu contato já entrou na fila de atendimento da Garagem do Ka.</p>
                {whatsappUrl && <a href={whatsappUrl} className="btn-primary mt-6 w-full py-3.5" target="_blank" rel="noreferrer">Iniciar conversa no WhatsApp <ArrowRight className="ml-2 h-4 w-4" /></a>}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Solicitar atendimento</p><h2 className="mt-1 font-serif text-2xl font-bold text-white">Fale sobre seu veículo</h2></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="label">Seu nome</span><input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Como podemos chamar você?" /></label>
                  <label><span className="label">WhatsApp com DDD 11</span><input className="input" required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="label">Bairro</span><input className="input" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Ex.: Eloy Chaves" /></label>
                  <label><span className="label">Veículo</span><input className="input" required minLength={2} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="Ex.: Honda Fit 2020" /></label>
                </div>
                <label><span className="label">Principal interesse</span><select className="input" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}><option value="avaliacao">Quero uma avaliação</option><option value="lavagem">Lavagem e cuidado externo</option><option value="polimento">Polimento e correção</option><option value="protecao">Proteção de pintura</option><option value="higienizacao">Higienização interna</option></select></label>
                <input className="hidden" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} aria-hidden="true" />
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3.5"><input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-1 h-4 w-4 accent-[#d4af37]" /><span className="text-xs leading-5 text-slate-400">Autorizo a Garagem do Ka a entrar em contato pelo WhatsApp sobre avaliação, orçamento e agendamento. Posso cancelar essa autorização a qualquer momento.</span></label>
                {error && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5 text-sm text-red-300">{error}</div>}
                <button type="submit" className="btn-primary w-full py-3.5" disabled={loading || !form.consent}>{loading ? "Registrando..." : "Receber orientação pelo WhatsApp"}<ArrowRight className="ml-2 h-4 w-4" /></button>
                <p className="flex items-center justify-center gap-2 text-[11px] text-slate-600"><ShieldCheck className="h-3.5 w-3.5" /> Seus dados são usados somente para este atendimento.</p>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
