"use client";

import Link from "next/link";
import { type ElementType, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Headphones,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface DashboardData {
  totalClients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  monthRevenue: number;
  monthExpenses: number;
  whatsappSessions: number;
  whatsappAppointments: number;
  blockedDatesCount: number;
  activeServices: number;
  recentAppointments: Array<{
    id: string;
    date: string;
    startTime: string;
    status: string;
    client: { name: string };
    service: { name: string };
  }>;
}

interface DashboardResponse {
  success: boolean;
  data?: DashboardData;
  error?: string;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  description: string;
  icon: ElementType;
  tone?: "gold" | "emerald" | "violet" | "blue";
}

const metricTones = {
  gold: {
    icon: "bg-brand-400/15 text-brand-200 ring-brand-400/20",
    line: "from-brand-300 via-brand-500 to-transparent",
  },
  emerald: {
    icon: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    line: "from-emerald-300 via-emerald-500 to-transparent",
  },
  violet: {
    icon: "bg-violet-400/10 text-violet-300 ring-violet-400/20",
    line: "from-violet-300 via-violet-500 to-transparent",
  },
  blue: {
    icon: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
    line: "from-sky-300 via-sky-500 to-transparent",
  },
};

function MetricCard({ label, value, description, icon: Icon, tone = "gold" }: MetricCardProps) {
  const colors = metricTones[tone];

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-brand-900/35 bg-surface-800/90 p-5 shadow-gold transition duration-300 hover:-translate-y-0.5 hover:border-brand-700/50 hover:bg-surface-750">
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-70", colors.line)} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-3 font-serif text-2xl font-bold tracking-tight text-brand-100 sm:text-3xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        <div className={cn("rounded-xl p-3 ring-1", colors.icon)}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
      </div>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Carregando painel">
      <div className="h-16 max-w-xl rounded-2xl bg-surface-800" />
      <div className="h-44 rounded-3xl border border-brand-900/30 bg-surface-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-40 rounded-2xl border border-surface-700 bg-surface-800" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="h-96 rounded-2xl border border-surface-700 bg-surface-800" />
        <div className="h-96 rounded-2xl border border-surface-700 bg-surface-800" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const result = (await response.json()) as DashboardResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error ?? "Não foi possível carregar os dados do painel.");
      }

      setData(result.data);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os dados do painel.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const performance = useMemo(() => {
    const revenue = data?.monthRevenue ?? 0;
    const expenses = data?.monthExpenses ?? 0;
    const profit = revenue - expenses;
    const margin = revenue > 0 ? Math.max(0, Math.min(100, (profit / revenue) * 100)) : 0;

    return { revenue, expenses, profit, margin };
  }, [data]);

  if (loading) return <DashboardSkeleton />;

  const upcomingAppointments = data?.recentAppointments ?? [];
  const pendingAppointments = data?.pendingAppointments ?? 0;
  const isHealthyQueue = pendingAppointments === 0;
  const totalClients = data?.totalClients ?? 0;
  const monthlyWhatsAppAppointments = data?.whatsappAppointments ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] pb-8">
      <AdminHeader
        title="Central de operação"
        description="Uma visão clara da agenda, do relacionamento e do desempenho da Garagem do Ka."
        actions={
          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            disabled={refreshing}
            className="btn-secondary min-h-10 gap-2 px-3.5"
            aria-label="Atualizar indicadores do painel"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span>{refreshing ? "Atualizando" : "Atualizar"}</span>
          </button>
        }
      />

      {error ? (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-red-500/25 bg-red-950/25 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-red-200">Não foi possível atualizar a central</p>
            <p className="mt-1 text-sm text-red-200/70">{error}</p>
          </div>
          <button type="button" onClick={() => void loadDashboard(true)} className="btn-secondary shrink-0">
            Tentar novamente
          </button>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-brand-700/35 bg-[radial-gradient(circle_at_78%_15%,rgba(212,175,55,0.20),transparent_28%),linear-gradient(135deg,#1e1a10_0%,#15130d_42%,#111111_100%)] px-5 py-6 shadow-[0_18px_60px_rgba(0,0,0,0.32)] sm:px-7 sm:py-7">
        <div className="absolute -right-20 -top-16 h-52 w-52 rounded-full border border-brand-300/10" />
        <div className="absolute -right-8 -top-4 h-32 w-32 rounded-full border border-brand-300/10" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">
              <Sparkles className="h-3.5 w-3.5" />
              Gestão em tempo real
            </div>
            <h2 className="mt-4 font-serif text-3xl font-bold tracking-tight text-brand-100 sm:text-4xl">Seu dia, sob controle.</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Priorize a agenda, acompanhe o caixa e mantenha cada conversa do WhatsApp perto da conversão.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[540px]">
            <div className="rounded-2xl border border-brand-300/15 bg-black/15 px-4 py-3.5 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Agenda hoje</p>
              <p className="mt-1.5 font-serif text-2xl font-bold text-brand-100">{data?.todayAppointments ?? 0}</p>
              <p className="mt-1 text-xs text-slate-400">atendimentos programados</p>
            </div>
            <div className="rounded-2xl border border-brand-300/15 bg-black/15 px-4 py-3.5 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">A confirmar</p>
              <p className="mt-1.5 font-serif text-2xl font-bold text-brand-100">{pendingAppointments}</p>
              <p className="mt-1 text-xs text-slate-400">prioridade da operação</p>
            </div>
            <div className="rounded-2xl border border-brand-300/15 bg-black/15 px-4 py-3.5 backdrop-blur-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">WhatsApp</p>
              <p className="mt-1.5 font-serif text-2xl font-bold text-brand-100">{data?.whatsappSessions ?? 0}</p>
              <p className="mt-1 text-xs text-slate-400">conversas nos últimos 7 dias</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Faturamento do mês"
          value={formatCurrency(performance.revenue)}
          description="Receitas lançadas no período atual."
          icon={CircleDollarSign}
          tone="gold"
        />
        <MetricCard
          label="Resultado operacional"
          value={formatCurrency(performance.profit)}
          description={
            performance.revenue > 0
              ? `${performance.margin.toFixed(0)}% de margem após despesas.`
              : "Aguardando lançamentos financeiros."
          }
          icon={CheckCircle2}
          tone={performance.profit >= 0 ? "emerald" : "violet"}
        />
        <MetricCard
          label="Base de clientes"
          value={totalClients}
          description={`${data?.totalAppointments ?? 0} agendamentos registrados.`}
          icon={UsersRound}
          tone="blue"
        />
        <MetricCard
          label="Conversas qualificadas"
          value={monthlyWhatsAppAppointments}
          description="Agendamentos criados pelo bot neste mês."
          icon={MessageCircle}
          tone="violet"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <article className="overflow-hidden rounded-2xl border border-brand-900/35 bg-surface-800 shadow-gold">
          <div className="flex flex-col gap-4 border-b border-brand-900/35 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-300" />
                <h2 className="font-serif text-xl font-bold text-brand-100">Próximos atendimentos</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">Acompanhe quem chega a seguir e mantenha a equipe preparada.</p>
            </div>
            <Link href="/admin/agendamentos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 transition hover:text-brand-100">
              Ver agenda completa
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {upcomingAppointments.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="rounded-2xl bg-brand-900/25 p-4 ring-1 ring-brand-700/30">
                <Calendar className="h-7 w-7 text-brand-300" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-200">Nenhum atendimento próximo</h3>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Quando a agenda receber novas reservas, elas aparecerão aqui para a sua equipe.</p>
              <Link href="/admin/agendamentos" className="btn-primary mt-5">
                Abrir agenda
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-surface-700/80">
              {upcomingAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="group flex flex-col gap-4 px-5 py-4 transition hover:bg-surface-750/60 sm:flex-row sm:items-center sm:px-6"
                >
                  <div className="flex w-full items-center gap-3 sm:w-36 sm:shrink-0">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-brand-700/30 bg-brand-900/20 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-300">Hora</span>
                      <span className="text-sm font-bold text-brand-100">{appointment.startTime}</span>
                    </div>
                    <div className="sm:hidden">
                      <p className="text-sm font-semibold text-slate-200">{appointment.client.name}</p>
                      <p className="text-xs text-slate-500">{formatDate(appointment.date)}</p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-100">{appointment.client.name}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-400">{appointment.service.name}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <p className="text-xs font-medium text-slate-500">{formatDate(appointment.date)}</p>
                    <StatusBadge status={appointment.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <div className="space-y-6">
          <article className="rounded-2xl border border-brand-900/35 bg-surface-800 p-5 shadow-gold sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-brand-300" />
                  <h2 className="font-serif text-xl font-bold text-brand-100">Pulso financeiro</h2>
                </div>
                <p className="mt-1 text-sm text-slate-400">Leitura rápida do mês atual.</p>
              </div>
              <Link href="/admin/financeiro" className="rounded-lg p-2 text-brand-300 transition hover:bg-brand-900/30 hover:text-brand-100" aria-label="Abrir financeiro">
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-400">Receitas</span>
                <span className="font-semibold text-emerald-300">{formatCurrency(performance.revenue)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-slate-400">Despesas</span>
                <span className="font-semibold text-red-300">{formatCurrency(performance.expenses)}</span>
              </div>
              <div className="border-t border-surface-700 pt-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Saldo do período</p>
                    <p className={cn("mt-1 font-serif text-2xl font-bold", performance.profit >= 0 ? "text-brand-100" : "text-red-300")}>
                      {formatCurrency(performance.profit)}
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-900/30 px-2.5 py-1 text-xs font-semibold text-brand-200">
                    {performance.revenue > 0 ? `${performance.margin.toFixed(0)}% margem` : "Sem dados"}
                  </span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-700">
                  <div className="h-full rounded-full bg-gold-gradient transition-all duration-500" style={{ width: `${performance.margin}%` }} />
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-brand-900/35 bg-surface-800 p-5 shadow-gold sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-400/10 p-2.5 ring-1 ring-emerald-400/20">
                <Bot className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-xl font-bold text-brand-100">Assistente WhatsApp</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Operação
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-400">Fluxo inteligente para acolher, qualificar e levar clientes até a agenda.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-surface-700 bg-surface-850/70 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Sessões 7d</p>
                <p className="mt-1 font-serif text-2xl font-bold text-slate-100">{data?.whatsappSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-surface-700 bg-surface-850/70 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Serviços ativos</p>
                <p className="mt-1 font-serif text-2xl font-bold text-slate-100">{data?.activeServices ?? 0}</p>
              </div>
            </div>
            <Link href="/admin/fluxo" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-700/40 bg-brand-900/20 px-4 py-2.5 text-sm font-semibold text-brand-200 transition hover:border-brand-500/50 hover:bg-brand-900/35 hover:text-brand-100">
              Abrir fluxo do WhatsApp
              <ChevronRight className="h-4 w-4" />
            </Link>
          </article>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <article className="rounded-2xl border border-brand-900/35 bg-surface-800 p-5 shadow-gold sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-brand-300" />
                <h2 className="font-serif text-xl font-bold text-brand-100">Fila de atenção</h2>
              </div>
              <p className="mt-1 text-sm text-slate-400">O que merece uma ação da sua equipe agora.</p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                isHealthyQueue ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20" : "bg-amber-400/10 text-amber-200 ring-amber-400/20"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isHealthyQueue ? "bg-emerald-300" : "bg-amber-300")} />
              {isHealthyQueue ? "Em dia" : "Requer atenção"}
            </span>
          </div>

          <div className="mt-5 space-y-2">
            <Link href="/admin/agendamentos" className="group flex items-center gap-4 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-200 ring-1 ring-amber-400/15">
                <Clock3 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200">Confirmações pendentes</p>
                <p className="mt-0.5 text-xs text-slate-500">Revise reservas que ainda aguardam retorno.</p>
              </div>
              <span className="font-serif text-xl font-bold text-brand-200">{pendingAppointments}</span>
              <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
            <Link href="/admin/bloqueio" className="group flex items-center gap-4 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/15">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200">Indisponibilidades futuras</p>
                <p className="mt-0.5 text-xs text-slate-500">Mantenha os horários do bot alinhados com a operação.</p>
              </div>
              <span className="font-serif text-xl font-bold text-brand-200">{data?.blockedDatesCount ?? 0}</span>
              <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
          </div>
        </article>

        <article className="rounded-2xl border border-brand-900/35 bg-surface-800 p-5 shadow-gold sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-300" />
            <h2 className="font-serif text-xl font-bold text-brand-100">Atalhos da operação</h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">Acesse rapidamente as áreas que mais movem o seu dia.</p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href="/admin/atendimento" className="group flex items-center gap-3 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <span className="rounded-lg bg-brand-900/30 p-2 text-brand-300"><Headphones className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Atendimento</span>
              <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
            <Link href="/admin/clientes" className="group flex items-center gap-3 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <span className="rounded-lg bg-brand-900/30 p-2 text-brand-300"><UsersRound className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Clientes</span>
              <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
            <Link href="/admin/agendamentos" className="group flex items-center gap-3 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <span className="rounded-lg bg-brand-900/30 p-2 text-brand-300"><CalendarClock className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Agenda</span>
              <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
            <Link href="/admin/servicos" className="group flex items-center gap-3 rounded-xl border border-surface-700/80 bg-surface-850/50 p-3.5 transition hover:border-brand-700/40 hover:bg-surface-750">
              <span className="rounded-lg bg-brand-900/30 p-2 text-brand-300"><Wrench className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-200">Serviços</span>
              <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-brand-300" />
            </Link>
          </div>
        </article>
      </section>

      {lastUpdated ? (
        <p className="mt-5 text-right text-xs text-slate-600">
          Indicadores atualizados às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      ) : null}
    </div>
  );
}
