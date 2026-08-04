"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  Lightbulb,
  MessageCircleMore,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { cn } from "@/lib/utils";

export type CommandView = "operation" | "insights" | "retention";

interface CommandData {
  operation: {
    score: number;
    todayAppointments: Array<{ id: string; time: string; endTime: string; status: string; paymentStatus: string; client: string; phone: string; vehicle: string | null; service: string; value: number; href: string }>;
    conversations: Array<{ id: string; client: string; phone: string; preview: string | null; unreadCount: number; handoffStatus: string; waitingSince: string | null; href: string }>;
    queue: { pending: number; retrying: number; dailyLimit: number };
    pendingPayments: number;
    pendingConfirmations: number;
    expectedToday: number;
    settings: { whatsappEnabled: boolean; testModeEnabled: boolean; businessHoursStart: string; businessHoursEnd: string } | null;
  };
  insights: {
    revenue: number; revenueChange: number; expenses: number; profit: number; bookings: number; bookingsChange: number;
    averageTicket: number; completionRate: number; whatsappShare: number; uniqueClients: number;
    funnel: { created: number; active: number; completed: number; cancelled: number; noShow: number };
    services: Array<{ id: string; name: string; bookings: number; value: number }>;
    sources: Array<{ source: string; count: number }>;
  };
  retention: {
    counts: { active: number; days30: number; days60: number; days90: number; never: number };
    opportunities: Array<{ id: string; name: string; phone: string; vehicle: string | null; lastService: string | null; lastVisitAt: string | null; daysSince: number | null; segment: string; marketingConsent: boolean; href: string }>;
  };
  generatedAt: string;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const tabs: Array<{ id: CommandView; label: string; description: string; icon: typeof Activity }> = [
  { id: "operation", label: "Central de ação", description: "O que precisa de atenção agora", icon: Gauge },
  { id: "insights", label: "Insights", description: "Resultado e conversão em 30 dias", icon: BarChart3 },
  { id: "retention", label: "Retenção", description: "Clientes prontos para voltar", icon: RotateCcw },
];

let commandCache: { data: CommandData; savedAt: number } | null = null;

function Kpi({ label, value, detail, icon: Icon, tone = "gold" }: { label: string; value: string | number; detail: string; icon: typeof Activity; tone?: "gold" | "green" | "blue" | "red" }) {
  const toneClass = { gold: "bg-brand-400/10 text-brand-200 ring-brand-400/20", green: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20", blue: "bg-sky-400/10 text-sky-300 ring-sky-400/20", red: "bg-red-400/10 text-red-300 ring-red-400/20" }[tone];
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-3 truncate font-serif text-3xl font-bold text-brand-100">{value}</p><p className="mt-1.5 text-xs leading-5 text-slate-400">{detail}</p></div>
        <span className={cn("rounded-xl p-2.5 ring-1", toneClass)}><Icon className="h-5 w-5" /></span>
      </div>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-slate-500"><CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-emerald-400" />{text}</div>;
}

export function BusinessCommandCenter({ initialView }: { initialView: CommandView }) {
  const [view, setView] = useState<CommandView>(initialView);
  const [data, setData] = useState<CommandData | null>(() => commandCache?.data ?? null);
  const [loading, setLoading] = useState(() => !commandCache);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState("all");

  const load = useCallback(async (force = false) => {
    if (!force && commandCache && Date.now() - commandCache.savedAt < 60_000) {
      setData(commandCache.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/business-command", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Falha ao carregar gestão");
      setData(payload.data);
      commandCache = { data: payload.data, savedAt: Date.now() };
      const operationalStatus = !payload.data.operation.settings?.whatsappEnabled
        ? "critical"
        : payload.data.operation.settings?.testModeEnabled || payload.data.operation.queue.dailyLimit > 0
          ? "warning"
          : "healthy";
      window.dispatchEvent(new CustomEvent("whatsapp-health", { detail: operationalStatus }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setView(initialView); }, [initialView]);

  const opportunities = useMemo(() => {
    if (!data) return [];
    return segment === "all" ? data.retention.opportunities : data.retention.opportunities.filter((item) => item.segment === segment);
  }, [data, segment]);

  function exportRetention() {
    if (!opportunities.length) return;
    const rows = [["Nome", "Telefone", "Veículo", "Último serviço", "Dias sem retorno", "Marketing autorizado"], ...opportunities.map((item) => [item.name, item.phone, item.vehicle ?? "", item.lastService ?? "", item.daysSince?.toString() ?? "Nunca agendou", item.marketingConsent ? "Sim" : "Não"] )];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `retencao-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  const header = tabs.find((item) => item.id === view) ?? tabs[0];
  return (
    <div className="pb-24 lg:pb-8">
      <AdminHeader title={header.label} description={header.description} eyebrow="Cockpit de gestão" icon={header.icon} actions={<button onClick={() => void load(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3.5 py-2 text-xs font-semibold text-brand-100 transition hover:bg-brand-500/15 disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Atualizar</button>} />

      <div className="mb-6 grid gap-2 rounded-2xl border border-white/[0.07] bg-surface-850/70 p-1.5 md:grid-cols-3">
        {tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setView(item.id)} className={cn("flex items-center gap-3 rounded-xl px-4 py-3 text-left transition", view === item.id ? "bg-brand-500/14 text-brand-100 ring-1 ring-inset ring-brand-400/25" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")}><Icon className="h-4 w-4 shrink-0" /><span><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.description}</span></span></button>; })}
      </div>

      {error && <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-200">{error}</div>}
      {loading && !data && <div className="grid min-h-[360px] place-items-center rounded-3xl border border-white/[0.06] bg-surface-850/60"><RefreshCw className="h-7 w-7 animate-spin text-brand-300" /></div>}

      {data && view === "operation" && <Operation data={data} />}
      {data && view === "insights" && <Insights data={data} />}
      {data && view === "retention" && <Retention data={data} opportunities={opportunities} segment={segment} setSegment={setSegment} exportRetention={exportRetention} />}
      {data && <p className="mt-6 text-right text-[11px] text-slate-600">Atualizado {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
    </div>
  );
}

function Operation({ data }: { data: CommandData }) {
  const op = data.operation;
  const attention = op.conversations.length + op.pendingConfirmations + op.queue.pending;
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Saúde da operação" value={`${op.score}%`} detail={op.score >= 85 ? "Rotina sob controle" : "Existem pendências para revisar"} icon={Gauge} tone={op.score >= 85 ? "green" : "gold"} />
      <Kpi label="Ações pendentes" value={attention} detail="Conversas, confirmações e fila" icon={AlertTriangle} tone={attention ? "red" : "green"} />
      <Kpi label="Agenda de hoje" value={op.todayAppointments.length} detail={`${op.pendingConfirmations} aguardando confirmação`} icon={CalendarClock} tone="blue" />
      <Kpi label="Previsão do dia" value={money.format(op.expectedToday)} detail={`${op.pendingPayments} pagamento(s) pendente(s)`} icon={WalletCards} />
    </div>
    {(!op.settings?.whatsappEnabled || op.settings?.testModeEnabled || op.queue.dailyLimit > 0) && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100"><AlertTriangle className="h-5 w-5" /><span className="flex-1">{!op.settings?.whatsappEnabled ? "WhatsApp desativado." : op.queue.dailyLimit > 0 ? "Há mensagens bloqueadas pelo limite diário da API." : "O WhatsApp está em modo de teste."}</span><Link href="/admin/whatsapp" className="font-semibold text-brand-200">Revisar central <ArrowRight className="inline h-4 w-4" /></Link></div>}
    <div className="grid gap-6 xl:grid-cols-[1.02fr_.98fr]">
      <section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-400">Atendimento</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Quem espera resposta</h2></div><Link href="/admin/atendimento" className="text-xs font-semibold text-brand-300">Ver conversas</Link></div>{op.conversations.length ? <div className="space-y-2">{op.conversations.slice(0, 7).map((item) => <Link href={item.href} key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.055] bg-black/10 p-3 transition hover:border-brand-500/20 hover:bg-brand-500/[0.04]"><span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-200">{item.client.charAt(0)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-200">{item.client}</span><span className="block truncate text-xs text-slate-500">{item.preview || "Conversa aguardando continuidade"}</span></span>{item.unreadCount > 0 && <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black">{item.unreadCount}</span>}<ArrowRight className="h-4 w-4 text-slate-600" /></Link>)}</div> : <Empty text="Nenhum cliente aguardando resposta." />}</section>
      <section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-sky-400">Agenda</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Próximos atendimentos</h2></div><Link href="/admin/agendamentos" className="text-xs font-semibold text-brand-300">Abrir agenda</Link></div>{op.todayAppointments.length ? <div className="space-y-2">{op.todayAppointments.slice(0, 8).map((item) => <Link href={item.href} key={item.id} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-xl border border-white/[0.055] p-3 hover:border-brand-500/20"><span className="font-mono text-sm font-bold text-brand-200">{item.time}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-200">{item.client} · {item.service}</span><span className="block truncate text-xs text-slate-500">{item.vehicle || "Veículo não informado"}</span></span><span className="text-xs font-semibold text-slate-300">{money.format(item.value)}</span></Link>)}</div> : <Empty text="Nenhum atendimento marcado para hoje." />}</section>
    </div>
  </div>;
}

function Insights({ data }: { data: CommandData }) {
  const item = data.insights; const maxService = Math.max(1, ...item.services.map((service) => service.value)); const maxSource = Math.max(1, ...item.sources.map((source) => source.count));
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Faturamento 30 dias" value={money.format(item.revenue)} detail={`${item.revenueChange >= 0 ? "+" : ""}${item.revenueChange}% contra período anterior`} icon={item.revenueChange >= 0 ? TrendingUp : TrendingDown} tone={item.revenueChange >= 0 ? "green" : "red"} /><Kpi label="Lucro registrado" value={money.format(item.profit)} detail={`${money.format(item.expenses)} em despesas`} icon={WalletCards} /><Kpi label="Ticket médio" value={money.format(item.averageTicket)} detail={`${item.uniqueClients} clientes únicos`} icon={Sparkles} tone="blue" /><Kpi label="Conclusão" value={`${item.completionRate}%`} detail={`${item.whatsappShare}% dos agendamentos via WhatsApp`} icon={UserRoundCheck} tone="green" /></div><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-400">Portfólio</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Serviços que mais movimentam receita</h2><div className="mt-5 space-y-4">{item.services.length ? item.services.map((service) => <div key={service.id}><div className="mb-1.5 flex justify-between gap-4 text-xs"><span className="truncate font-semibold text-slate-300">{service.name}</span><span className="shrink-0 text-brand-200">{money.format(service.value)} · {service.bookings}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-300" style={{ width: `${Math.max(4, Math.round((service.value / maxService) * 100))}%` }} /></div></div>) : <Empty text="Ainda não há serviços no período." />}</div></section><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-sky-400">Aquisição</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Origem dos agendamentos</h2><div className="mt-5 space-y-4">{item.sources.length ? item.sources.map((source) => <div key={source.source}><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold capitalize text-slate-300">{source.source}</span><span className="text-sky-300">{source.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-sky-700 to-sky-300" style={{ width: `${Math.max(4, Math.round((source.count / maxSource) * 100))}%` }} /></div></div>) : <Empty text="Ainda não há origens registradas." />}</div></section></div><section className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-violet-400/10 p-2.5 text-violet-300"><Lightbulb className="h-5 w-5" /></span><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-violet-300">Leitura executiva</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">{item.revenueChange >= 0 ? "A receita está evoluindo" : "A receita pede atenção"}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Foram criados {item.funnel.created} agendamentos nos últimos 30 dias, com {item.funnel.completed} concluídos e {item.funnel.cancelled + item.funnel.noShow} perdas. Priorize os serviços com maior valor e use a aba Retenção para preencher horários vagos.</p></div></div></section></div>;
}

function Retention({ data, opportunities, segment, setSegment, exportRetention }: { data: CommandData; opportunities: CommandData["retention"]["opportunities"]; segment: string; setSegment: (value: string) => void; exportRetention: () => void }) {
  const groups = [{ id: "all", label: "Todas", count: data.retention.opportunities.length }, { id: "30-59", label: "30–59 dias", count: data.retention.counts.days30 }, { id: "60-89", label: "60–89 dias", count: data.retention.counts.days60 }, { id: "90+", label: "90+ dias", count: data.retention.counts.days90 }, { id: "never", label: "Nunca agendou", count: data.retention.counts.never }];
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Oportunidades" value={data.retention.opportunities.length} detail="Clientes elegíveis para reativação" icon={UsersRound} /><Kpi label="30–59 dias" value={data.retention.counts.days30} detail="Momento ideal para lembrar" icon={Clock3} tone="green" /><Kpi label="60–89 dias" value={data.retention.counts.days60} detail="Risco moderado de perda" icon={AlertTriangle} tone="gold" /><Kpi label="90+ dias" value={data.retention.counts.days90} detail="Prioridade de reconquista" icon={RotateCcw} tone="red" /></div><section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-surface-800/90"><div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-400">Carteira de clientes</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Oportunidades de retorno</h2><p className="mt-1 text-xs text-slate-500">Use campanhas somente para contatos com autorização de marketing.</p></div><div className="flex flex-wrap gap-2"><button onClick={exportRetention} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-brand-500/25 hover:text-brand-100"><Download className="h-4 w-4" />Exportar CSV</button><Link href="/admin/campanhas" className="inline-flex items-center gap-2 rounded-xl bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-100 ring-1 ring-inset ring-brand-400/25">Criar campanha <ArrowRight className="h-4 w-4" /></Link></div></div><div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] p-3 [scrollbar-width:none]">{groups.map((group) => <button key={group.id} onClick={() => setSegment(group.id)} className={cn("whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition", segment === group.id ? "bg-brand-500/15 text-brand-100 ring-1 ring-brand-400/25" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")}>{group.label} <span className="ml-1 opacity-60">{group.count}</span></button>)}</div>{opportunities.length ? <div className="divide-y divide-white/[0.055]">{opportunities.slice(0, 50).map((item) => <div key={item.id} className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.018] md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-200">{item.name}</p><p className="text-xs text-slate-500">{item.phone}</p></div><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-300">{item.vehicle || "Veículo não informado"}</p><p className="truncate text-xs text-slate-600">{item.lastService || "Nunca agendou"}</p></div><div><p className="text-xs font-semibold text-brand-200">{item.daysSince === null ? "Sem primeira visita" : `${item.daysSince} dias sem retorno`}</p><p className="text-[11px] text-slate-600">{item.lastVisitAt ? date.format(new Date(item.lastVisitAt)) : "Cadastro sem agendamento"}</p><span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", item.marketingConsent ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-700/50 text-slate-500")}>{item.marketingConsent ? "Marketing autorizado" : "Sem autorização"}</span></div><Link href={item.href} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-500/20 px-3 py-2 text-xs font-semibold text-brand-100 hover:bg-brand-500/10"><MessageCircleMore className="h-4 w-4" />Abrir conversa</Link></div>)}</div> : <div className="p-5"><Empty text="Nenhuma oportunidade neste segmento." /></div>}</section></div>;
}
