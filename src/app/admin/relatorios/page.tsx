"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, BarChart3, TrendingUp, DollarSign, CalendarDays, Users, FileText, RefreshCw, AlertCircle } from "lucide-react";

type ReportData = { summary?: { thisMonthRevenue?: number; lastMonthRevenue?: number; thisMonthAppointments?: number; lastMonthAppointments?: number; count?: number; totalIncome?: number; totalExpense?: number; balance?: number }; items?: Array<Record<string, any>>; [key: string]: any; };

const reportTypes = [
  { key: "summary", label: "Resumo", icon: BarChart3 },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "agendamentos", label: "Agendamentos", icon: CalendarDays },
  { key: "financeiro", label: "Financeiro", icon: DollarSign },
];

export default function RelatoriosPage() {
  const [from, setFrom] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string>("summary");

  const fetchReport = useCallback(async (type: string) => {
    setLoading(true); setMessage(null); setActiveType(type);
    try {
      const res = await fetch("/api/relatorios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, type }) });
      const json = await res.json();
      if (!res.ok || !json.success) { setMessage(json.error || "Erro ao carregar"); setData(null); return null; }
      const payload = json.data as ReportData; setData(payload); return payload;
    } catch { setMessage("Erro de conexão"); setData(null); return null; }
    finally { setLoading(false); }
  }, [from, to]);

  async function exportCSV(type: string) {
    const result = await fetchReport(type);
    const rows = result?.items ?? [];
    if (!rows.length) { setMessage("Nenhum dado para exportar."); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${type}-${from}-to-${to}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  useEffect(() => { void fetchReport("summary"); }, [fetchReport]);

  const summary = data?.summary ?? {};
  const isListReport = activeType === "clientes" || activeType === "agendamentos" || activeType === "financeiro";
  const resultColumns = data?.items?.length ? Object.keys(data.items[0]).slice(0, 6) : [];

  function displayValue(value: unknown) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Relatórios"
        description="Acompanhe as métricas comerciais, financeiras e de relacionamento da operação."
        actions={
          <button onClick={() => void fetchReport(activeType)} disabled={loading} className="btn-secondary gap-2">
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
            Atualizar leitura
          </button>
        }
      />

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-700/50 bg-amber-950/30 px-5 py-4 text-amber-300 shadow-gold">
          <AlertCircle className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-medium">{message}</span>
        </div>
      )}

      {/* Filtros */}
      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">De</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Até</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {reportTypes.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => void fetchReport(key)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeType === key ? "btn-primary" : "btn-secondary"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <button onClick={() => void exportCSV(activeType)} className="btn-primary gap-2 px-4 py-2.5">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <TrendingUp className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Receita este mês</p>
              <p className="text-xl font-bold text-brand-200">R$ {Number(summary.thisMonthRevenue ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-700">
              <TrendingUp className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Mês anterior</p>
              <p className="text-xl font-bold text-slate-200">R$ {Number(summary.lastMonthRevenue ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/40 ring-1 ring-emerald-700/30">
              <CalendarDays className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Agendamentos (mês)</p>
              <p className="text-xl font-bold text-brand-200">{summary.thisMonthAppointments ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900/40 ring-1 ring-blue-700/30">
              <CalendarDays className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Mês anterior</p>
              <p className="text-xl font-bold text-slate-200">{summary.lastMonthAppointments ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financeiro extra */}
      {activeType === "financeiro" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-700/50 bg-emerald-950/40 p-5 shadow-gold">
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Entradas</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">R$ {Number(summary.totalIncome ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-red-700/50 bg-red-950/40 p-5 shadow-gold">
            <p className="text-xs font-medium text-red-400 uppercase tracking-wider">Saídas</p>
            <p className="mt-1 text-2xl font-bold text-red-300">R$ {Number(summary.totalExpense ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-brand-700/50 bg-brand-950/40 p-5 shadow-gold">
            <p className="text-xs font-medium text-brand-400 uppercase tracking-wider">Saldo</p>
            <p className="mt-1 text-2xl font-bold text-brand-300">R$ {Number(summary.balance ?? 0).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Resultados */}
      <div className="card">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
            <FileText className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Resultados</h2>
            <p className="text-sm text-slate-400">{isListReport ? `${summary.count ?? 0} registro(s) encontrado(s)` : "Resumo do período"}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-brand-400" /></div>
        ) : data?.items?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  {resultColumns.map((column) => (
                    <th key={column} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {column.replace(/([A-Z])/g, " $1").trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, 10).map((row, index) => (
                  <tr key={index}>
                    {resultColumns.map((column) => (
                      <td key={column} className="max-w-[260px] truncate px-4 py-3 text-slate-300" title={displayValue(row[column])}>
                        {displayValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length > 10 && <p className="border-t border-surface-700 px-4 py-3 text-center text-xs text-slate-500">Mostrando 10 de {data.items.length} registros. Exporte CSV para a lista completa.</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <BarChart3 className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhum dado disponível</p>
            <p className="text-xs">Selecione um período e clique em um relatório</p>
          </div>
        )}
      </div>
    </div>
  );
}
