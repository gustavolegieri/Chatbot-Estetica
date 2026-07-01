"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, BarChart3, TrendingUp, DollarSign, CalendarDays, Users, FileText, RefreshCw, AlertCircle } from "lucide-react";

type ReportData = {
  summary?: {
    thisMonthRevenue?: number;
    lastMonthRevenue?: number;
    thisMonthAppointments?: number;
    lastMonthAppointments?: number;
    count?: number;
    totalIncome?: number;
    totalExpense?: number;
    balance?: number;
  };
  items?: Array<Record<string, any>>;
  [key: string]: any;
};

const reportTypes = [
  { key: "summary", label: "Resumo", icon: BarChart3, color: "bg-brand-50 text-brand-600" },
  { key: "clientes", label: "Clientes", icon: Users, color: "bg-blue-50 text-blue-600" },
  { key: "agendamentos", label: "Agendamentos", icon: CalendarDays, color: "bg-emerald-50 text-emerald-600" },
  { key: "financeiro", label: "Financeiro", icon: DollarSign, color: "bg-amber-50 text-amber-600" },
];

export default function RelatoriosPage() {
  const [from, setFrom] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string>("summary");

  async function fetchReport(type: string) {
    setLoading(true);
    setMessage(null);
    setActiveType(type);
    try {
      const res = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, type }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage(json.error || "Erro ao carregar o relatório");
        setData(null);
        return null;
      }
      const payload = json.data as ReportData;
      setData(payload);
      return payload;
    } catch {
      setMessage("Erro de conexão ao carregar o relatório");
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function exportCSV(type: string) {
    const result = await fetchReport(type);
    const rows = result?.items ?? [];
    if (!rows.length) {
      setMessage("Nenhum dado para exportar neste período.");
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void fetchReport("summary");
  }, []);

  const summary = data?.summary ?? {};
  const isListReport = activeType === "clientes" || activeType === "agendamentos" || activeType === "financeiro";

  return (
    <div className="space-y-6">
      <AdminHeader title="Relatórios" description="Acompanhe as métricas do seu negócio" />

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-lg">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-medium">{message}</span>
        </div>
      )}

      {/* Filtro de data e botões */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">De</label>
              <input type="date" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Até</label>
              <input type="date" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {reportTypes.map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => void fetchReport(key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  activeType === key
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button
              onClick={() => void exportCSV(activeType)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <TrendingUp className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Receita este mês</p>
              <p className="text-xl font-bold text-slate-800">R$ {Number(summary.thisMonthRevenue ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
              <TrendingUp className="h-5 w-5 text-slate-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Mês anterior</p>
              <p className="text-xl font-bold text-slate-800">R$ {Number(summary.lastMonthRevenue ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <CalendarDays className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Agendamentos (mês)</p>
              <p className="text-xl font-bold text-slate-800">{summary.thisMonthAppointments ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <CalendarDays className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Mês anterior</p>
              <p className="text-xl font-bold text-slate-800">{summary.lastMonthAppointments ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cards extras para financeiro */}
      {activeType === "financeiro" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Entradas</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">R$ {Number(summary.totalIncome ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Saídas</p>
            <p className="mt-1 text-2xl font-bold text-red-700">R$ {Number(summary.totalExpense ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-xs font-medium text-brand-600 uppercase tracking-wider">Saldo</p>
            <p className="mt-1 text-2xl font-bold text-brand-700">R$ {Number(summary.balance ?? 0).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Resultados */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <FileText className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Resultados</h2>
            <p className="text-sm text-slate-500">
              {isListReport
                ? `${summary.count ?? 0} registro(s) encontrado(s)`
                : "Resumo do período selecionado"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : data?.items?.length ? (
          <div className="overflow-x-auto">
            <pre className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
              {JSON.stringify(data.items.slice(0, 10), null, 2)}
            </pre>
            {data.items.length > 10 && (
              <p className="mt-2 text-center text-xs text-slate-400">Mostrando 10 de {data.items.length} registros</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <BarChart3 className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium">Nenhum dado disponível</p>
            <p className="text-xs">Selecione um período e clique em um relatório</p>
          </div>
        )}
      </div>
    </div>
  );
}