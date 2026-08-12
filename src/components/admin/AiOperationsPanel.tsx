"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Flame,
  Gauge,
  Lightbulb,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WandSparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type View = "overview" | "signals" | "quality" | "modules" | "copilot";
type Signal = {
  id: string; phone: string; clientName: string; vehicle: string | null; service: string | null;
  lastMessageAt: string | null; lastMessagePreview: string | null; sentiment: string; urgency: string;
  tone: string; intent: string; objection: string; leadScore: number; confidence: number; needsHuman: boolean;
  nextAction: string; summary: string; source: string; href: string;
};
type Report = {
  generatedAt: string;
  executiveBrief: string;
  metrics: { analyzed: number; hotLeads: number; priority: number; averageLeadScore: number; averageConfidence: number; inbound24h: number; outbound24h: number; unanswered: number; queue: number; negative: number; conversion: number; lossRate: number; anomalyScore: number };
  distributions: { objections: Array<{ name: string; label: string; count: number }>; sentiments: Array<{ name: string; label: string; count: number }>; intents: Array<{ name: string; label: string; count: number }> };
  hotLeads: Signal[]; priority: Signal[]; lowConfidence: Signal[]; recent: Signal[];
  modules: Array<{ name: string; description: string; active: boolean }>;
};

let localCache: { value: Report; savedAt: number } | null = null;

const sentimentLabel: Record<string, string> = { positive: "Positivo", neutral: "Neutro", negative: "Negativo" };
const urgencyLabel: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
const intentLabel: Record<string, string> = { price: "Preço", schedule: "Agendamento", service: "Serviço", complaint: "Reclamação", payment: "Pagamento", cancel: "Cancelamento", praise: "Elogio", other: "Outro" };

function Metric({ label, value, detail, icon: Icon, tone = "gold" }: { label: string; value: string | number; detail: string; icon: typeof Activity; tone?: "gold" | "green" | "blue" | "red" }) {
  const tones = { gold: "bg-brand-400/10 text-brand-200", green: "bg-emerald-400/10 text-emerald-300", blue: "bg-sky-400/10 text-sky-300", red: "bg-red-400/10 text-red-300" };
  return <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-4 shadow-[0_16px_44px_rgba(0,0,0,.15)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-2 truncate font-serif text-2xl font-bold text-brand-100">{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p></div><span className={cn("rounded-xl p-2.5", tones[tone])}><Icon className="h-4.5 w-4.5" /></span></div></article>;
}

function SignalCard({ signal, compact }: { signal: Signal; compact?: boolean }) {
  const urgent = signal.needsHuman || signal.urgency === "critical" || signal.urgency === "high";
  return <Link href={compact ? `/admin/mobile?phone=${encodeURIComponent(signal.phone)}` : signal.href} className="group block rounded-2xl border border-white/[0.07] bg-black/10 p-4 transition hover:border-brand-500/25 hover:bg-brand-500/[0.035]"><div className="flex items-start gap-3"><span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold", urgent ? "bg-red-400/10 text-red-300" : signal.leadScore >= 70 ? "bg-emerald-400/10 text-emerald-300" : "bg-brand-400/10 text-brand-200")}>{signal.clientName.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-slate-200">{signal.clientName}</strong><span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", urgent ? "bg-red-400/10 text-red-300" : "bg-emerald-400/10 text-emerald-300")}>{urgent ? urgencyLabel[signal.urgency] : `${signal.leadScore} pts`}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{signal.summary || signal.lastMessagePreview}</span><span className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-400">{intentLabel[signal.intent] || signal.intent}</span><span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-slate-400">{sentimentLabel[signal.sentiment] || signal.sentiment}</span>{signal.objection !== "none" && <span className="rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-300">Objeção: {signal.objection}</span>}</span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-700 transition group-hover:text-brand-300" /></div><div className="mt-3 rounded-xl bg-white/[0.025] px-3 py-2 text-[10px] leading-4 text-slate-500"><strong className="text-brand-300">Próxima ação:</strong> {signal.nextAction}</div></Link>;
}

export function AiOperationsPanel({ compact = false }: { compact?: boolean }) {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<Report | null>(() => localCache?.value ?? null);
  const [loading, setLoading] = useState(() => !localCache);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force && localCache && Date.now() - localCache.savedAt < 60_000) { setData(localCache.value); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/ai-automation${force ? "?refresh=true" : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Falha na análise");
      setData(payload.data); localCache = { value: payload.data, savedAt: Date.now() };
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a IA"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true); setAnswer("");
    try {
      const response = await fetch("/api/admin/ai-automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const payload = await response.json();
      const rawAnswer = payload.data?.answer || payload.error || "Não foi possível responder.";
      setAnswer(String(rawAnswer).replace(/\*\*/g, "").replace(/^#{1,4}\s*/gm, "").trim());
    } finally { setAsking(false); }
  }

  const topObjection = data?.distributions.objections.find((item) => item.name !== "none");
  const tabs: Array<{ id: View; label: string; icon: typeof Activity }> = compact
    ? [{ id: "overview", label: "Pulso", icon: Gauge }, { id: "signals", label: "Sinais", icon: Flame }, { id: "copilot", label: "Copiloto", icon: Sparkles }]
    : [{ id: "overview", label: "Visão geral", icon: Gauge }, { id: "signals", label: "Oportunidades", icon: Target }, { id: "quality", label: "Qualidade", icon: ShieldCheck }, { id: "modules", label: "Automações", icon: Zap }, { id: "copilot", label: "Copiloto", icon: Sparkles }];

  return <div className={cn("space-y-5", compact && "pb-4")}>
    <div className="flex items-start gap-3"><span className="rounded-2xl bg-violet-400/10 p-3 text-violet-300 ring-1 ring-violet-400/15"><BrainCircuit className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">Inteligência autônoma</p><h2 className={cn("mt-1 font-serif font-bold text-brand-100", compact ? "text-xl" : "text-2xl")}>Copiloto operacional</h2><p className="mt-1 text-xs leading-5 text-slate-500">A IA acompanha conversas, oportunidades, riscos e qualidade automaticamente.</p></div><button onClick={() => void load(true)} disabled={loading} className="rounded-xl border border-white/[0.08] p-2.5 text-slate-400 disabled:opacity-40" aria-label="Atualizar IA"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></button></div>
    <div className={cn("grid gap-1 rounded-2xl border border-white/[0.07] bg-black/15 p-1.5", compact ? "grid-cols-3" : "grid-cols-5")}>{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setView(tab.id)} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[10px] font-semibold transition sm:text-xs", view === tab.id ? "bg-violet-400/10 text-violet-200 ring-1 ring-violet-400/20" : "text-slate-600 hover:text-slate-300")}><Icon className="h-4 w-4 shrink-0" /><span className="truncate">{tab.label}</span></button>; })}</div>
    {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-xs text-red-200">{error}</div>}
    {loading && !data && <div className="grid min-h-64 place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.02]"><Loader2 className="h-6 w-6 animate-spin text-violet-300" /></div>}
    {data && view === "overview" && <><section className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-violet-400/[0.075] to-brand-500/[0.035] p-5"><div className="flex items-start gap-3"><WandSparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-violet-300">Leitura automática</p><p className="mt-2 text-sm leading-6 text-slate-300">{data.executiveBrief}</p></div></div></section><div className={cn("grid gap-3", compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4")}><Metric label="Leads quentes" value={data.metrics.hotLeads} detail="Alta intenção detectada" icon={Flame} tone="green" /><Metric label="Prioridade" value={data.metrics.priority} detail="Exigem atenção da equipe" icon={AlertTriangle} tone={data.metrics.priority ? "red" : "green"} /><Metric label="Confiança da IA" value={`${data.metrics.averageConfidence}%`} detail={`${data.metrics.analyzed} conversas analisadas`} icon={BrainCircuit} tone="blue" /><Metric label="Anomalias" value={`${data.metrics.anomalyScore}%`} detail={`${data.metrics.unanswered} sem resposta · ${data.metrics.queue} na fila`} icon={Activity} tone={data.metrics.anomalyScore > 30 ? "red" : "gold"} /></div>{!compact && <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><h3 className="font-serif text-lg font-bold text-brand-100">Oportunidades em destaque</h3><div className="mt-4 space-y-2">{data.hotLeads.slice(0, 4).map((item) => <SignalCard key={item.id} signal={item} />)}{!data.hotLeads.length && <p className="py-8 text-center text-xs text-slate-600">A IA ainda está formando os scores.</p>}</div></section><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><h3 className="font-serif text-lg font-bold text-brand-100">Distribuição inteligente</h3><div className="mt-4 space-y-4">{data.distributions.intents.slice(0, 6).map((item) => <div key={item.name}><div className="mb-1.5 flex justify-between text-xs"><span className="capitalize text-slate-400">{intentLabel[item.name] || item.name}</span><strong className="text-brand-200">{item.count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-brand-300" style={{ width: `${Math.max(5, Math.round((item.count / Math.max(1, data.metrics.analyzed)) * 100))}%` }} /></div></div>)}</div></section></div>}</>}
    {data && view === "signals" && <div className={cn("grid gap-5", !compact && "xl:grid-cols-2")}><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-4"><div className="flex items-center gap-2"><Flame className="h-5 w-5 text-emerald-300" /><h3 className="font-serif text-lg font-bold text-brand-100">Leads quentes</h3></div><div className="mt-4 space-y-2">{data.hotLeads.map((item) => <SignalCard compact={compact} key={item.id} signal={item} />)}{!data.hotLeads.length && <p className="py-8 text-center text-xs text-slate-600">Nenhuma oportunidade quente agora.</p>}</div></section><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-300" /><h3 className="font-serif text-lg font-bold text-brand-100">Prioridades</h3></div><div className="mt-4 space-y-2">{data.priority.map((item) => <SignalCard compact={compact} key={item.id} signal={item} />)}{!data.priority.length && <p className="py-8 text-center text-xs text-slate-600">Nenhuma situação crítica.</p>}</div></section></div>}
    {data && view === "quality" && <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-300" /><h3 className="font-serif text-lg font-bold text-brand-100">Baixa confiança</h3></div><p className="mt-1 text-xs text-slate-500">Conversas que ajudam a descobrir lacunas no atendimento.</p><div className="mt-4 space-y-2">{data.lowConfidence.map((item) => <SignalCard key={item.id} signal={item} />)}{!data.lowConfidence.length && <p className="py-8 text-center text-xs text-slate-600">Nenhuma lacuna relevante detectada.</p>}</div></section><section className="space-y-4"><div className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-400">Objeção principal</p><p className="mt-2 font-serif text-2xl font-bold text-brand-100">{topObjection?.label || "Nenhuma"}</p><p className="mt-1 text-xs text-slate-500">{topObjection?.count || 0} ocorrência(s) analisadas.</p></div><div className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-400">Qualidade operacional</p><div className="mt-4 space-y-3">{[["Mensagens recebidas", data.metrics.inbound24h], ["Respostas registradas", data.metrics.outbound24h], ["Sem resposta", data.metrics.unanswered], ["Sentimento negativo", data.metrics.negative]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3 py-2.5 text-xs"><span className="text-slate-500">{label}</span><strong className="text-slate-200">{value}</strong></div>)}</div></div></section></div>}
    {data && view === "modules" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.modules.map((module) => <article key={module.name} className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-4"><div className="flex items-start gap-3"><span className={cn("rounded-xl p-2.5", module.active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/30 text-slate-600")}>{module.active ? <CheckCircle2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span><div><h3 className="text-sm font-semibold text-slate-200">{module.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{module.description}</p><span className={cn("mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold", module.active ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/30 text-slate-500")}>{module.active ? "AUTOMÁTICA" : "AGUARDANDO API"}</span></div></div></article>)}</div>}
    {data && view === "copilot" && <section className="rounded-2xl border border-violet-400/15 bg-gradient-to-br from-[#171221] to-surface-850 p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-400/10 p-2.5 text-violet-300"><Sparkles className="h-5 w-5" /></span><div><h3 className="font-serif text-lg font-bold text-brand-100">Pergunte ao seu negócio</h3><p className="text-xs text-slate-500">A resposta usa os dados atuais do CRM.</p></div></div><div className="mt-5 flex items-end gap-2"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={compact ? 2 : 3} placeholder="Ex.: O que merece minha atenção hoje?" className="min-w-0 flex-1 resize-none rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-400/25" /><button type="button" aria-label="Perguntar ao copiloto" onClick={() => void ask()} disabled={!question.trim() || asking} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/25 disabled:opacity-40">{asking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div>{answer && <div className="mt-4 rounded-2xl border border-violet-400/10 bg-violet-400/[0.045] p-4 text-sm leading-6 text-slate-300">{answer}</div>}<div className="mt-4 flex flex-wrap gap-2">{["Quais leads estão mais quentes?", "Onde estamos perdendo clientes?", "Qual é a prioridade de hoje?"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)} className="rounded-full border border-white/[0.07] px-3 py-1.5 text-[10px] text-slate-500 hover:text-violet-200">{suggestion}</button>)}</div></section>}
    {data && <p className="text-right text-[9px] text-slate-700">Análise atualizada às {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
  </div>;
}
