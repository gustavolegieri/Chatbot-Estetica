"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface Metrics {
  averageTicket: { value: number; formatted: string };
  totalRevenue: { value: number; formatted: string };
  totalAppointments: number;
  uniqueClients: number;
  topServices: Array<{ serviceName: string; count: number; price: number }>;
}

const metricCards = [
  { key: "averageTicket", label: "Ticket médio", helper: "por atendimento", icon: TrendingUp, tone: "brand" },
  { key: "totalRevenue", label: "Faturamento", helper: "no período", icon: BarChart3, tone: "emerald" },
  { key: "totalAppointments", label: "Agendamentos", helper: "confirmados no período", icon: CalendarDays, tone: "sky" },
  { key: "uniqueClients", label: "Clientes únicos", helper: "base ativa no período", icon: Users, tone: "violet" },
] as const;

const toneClasses = {
  brand: "bg-brand-900/40 text-brand-300 ring-brand-700/40",
  emerald: "bg-emerald-900/35 text-emerald-400 ring-emerald-700/40",
  sky: "bg-sky-900/35 text-sky-400 ring-sky-700/40",
  violet: "bg-violet-900/35 text-violet-400 ring-violet-700/40",
};

export default function PainelTestePage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await fetch(`/api/painel-teste/metricas?${params.toString()}`);
      if (!response.ok) throw new Error("request_failed");
      const data = await response.json();
      setMetrics(data);
    } catch {
      setError("Não foi possível carregar os indicadores deste período.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  function metricValue(key: (typeof metricCards)[number]["key"]) {
    if (!metrics) return "—";
    if (key === "averageTicket") return metrics.averageTicket.formatted;
    if (key === "totalRevenue") return metrics.totalRevenue.formatted;
    return String(metrics[key]);
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Painel de métricas"
        description="Leitura rápida da operação para decisões comerciais e de relacionamento."
        actions={
          <button onClick={() => void fetchMetrics()} disabled={loading} className="btn-secondary gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar dados
          </button>
        }
      />

      <section className="card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/45 ring-1 ring-brand-700/40">
              <SlidersHorizontal className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="font-semibold text-brand-100">Recorte de análise</h2>
              <p className="mt-1 text-sm text-slate-400">Filtre o período para concentrar a leitura da operação.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Início</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="input min-w-48" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fim</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="input min-w-48" />
            </label>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-700/45 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ key, label, helper, icon: Icon, tone }) => (
          <article key={key} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
                  {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-700" /> : metricValue(key)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{helper}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
            <div>
              <h2 className="font-semibold text-brand-100">Serviços com maior tração</h2>
              <p className="mt-1 text-sm text-slate-400">Ranking de demanda e ticket por serviço.</p>
            </div>
            <span className="hidden items-center gap-1.5 text-xs font-medium text-brand-300 sm:inline-flex">
              Atualizado agora <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>

          {loading ? (
            <div className="flex h-60 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-300" />
            </div>
          ) : metrics?.topServices?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Posição</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Serviço</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Atendimentos</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Valor base</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.topServices.map((service, index) => (
                    <tr key={`${service.serviceName}-${index}`}>
                      <td className="px-5 py-4">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-900/35 text-xs font-bold text-brand-200">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-200">{service.serviceName}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-200">{service.count}</td>
                      <td className="px-5 py-4 text-right text-brand-200">
                        R$ {Number(service.price).toFixed(2).replace(".", ",")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-60 flex-col items-center justify-center px-6 text-center">
              <BarChart3 className="h-10 w-10 text-surface-500" />
              <p className="mt-3 text-sm font-medium text-slate-300">Ainda não há serviços no período</p>
              <p className="mt-1 text-xs text-slate-500">Ajuste o filtro ou aguarde novos atendimentos.</p>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-brand-700/35 bg-[radial-gradient(ellipse_at_top_right,_rgba(212,175,55,0.16),_transparent_56%),#1a1a1a] p-6 shadow-gold">
          <Sparkles className="h-6 w-6 text-brand-300" />
          <h2 className="mt-4 font-serif text-xl font-semibold text-brand-100">Visão de CRM</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Use esta leitura junto da fila de atendimento para identificar oportunidades de retorno, upgrade e fidelização.
          </p>
          <div className="mt-6 space-y-3 border-t border-brand-700/25 pt-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Base no período</span>
              <span className="font-semibold text-slate-200">{metrics?.uniqueClients ?? 0} clientes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Conversão operacional</span>
              <span className="font-semibold text-brand-200">{metrics?.totalAppointments ?? 0} agendas</span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
