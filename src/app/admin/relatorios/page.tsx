"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, BarChart2, FileText, TrendingUp } from "lucide-react";

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
      setMessage("Nenhum dado para exportar neste intervalo.");
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
    <div>
      <AdminHeader title="Relatórios" description="Confira métricas de negócio e exporte listas filtradas." />

      {message && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
          {message}
        </div>
      )}

      <div className="card">
        <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="label">De</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void fetchReport("summary")} className="btn-secondary">Resumo</button>
            <button onClick={() => void fetchReport("clientes")} className="btn-secondary">Clientes</button>
            <button onClick={() => void fetchReport("agendamentos")} className="btn-secondary">Agendamentos</button>
            <button onClick={() => void fetchReport("financeiro")} className="btn-secondary">Financeiro</button>
            <button onClick={() => void exportCSV(activeType)} className="btn-primary">
              <Download className="mr-2 h-4 w-4" /> Exportar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold">Resumo</h3>
          </div>
          {loading && !data ? (
            <p>Carregando resumo...</p>
          ) : summary && Object.keys(summary).length ? (
            <div className="space-y-2">
              <p>Receita este mês: R$ {Number(summary.thisMonthRevenue ?? 0).toFixed(2)}</p>
              <p>Receita mês anterior: R$ {Number(summary.lastMonthRevenue ?? 0).toFixed(2)}</p>
              <p>Agendamentos este mês: {summary.thisMonthAppointments ?? 0}</p>
              <p>Agendamentos mês anterior: {summary.lastMonthAppointments ?? 0}</p>
              {activeType === "financeiro" && (
                <>
                  <p>Total de entradas: R$ {Number(summary.totalIncome ?? 0).toFixed(2)}</p>
                  <p>Total de saídas: R$ {Number(summary.totalExpense ?? 0).toFixed(2)}</p>
                  <p>Saldo: R$ {Number(summary.balance ?? 0).toFixed(2)}</p>
                </>
              )}
            </div>
          ) : (
            <p>Nenhum resumo disponível.</p>
          )}
        </div>

        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sky-600" />
            <h3 className="font-semibold">Visão rápida</h3>
          </div>
          <div className="flex h-40 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
            {isListReport ? `${summary.count ?? 0} resultados encontrados para o período selecionado.` : "Use os botões para carregar um relatório e visualizar o resumo aqui."}
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold">Resultado</h3>
        </div>
        <div className="overflow-x-auto">
          {data?.items?.length ? (
            <pre className="text-xs">{JSON.stringify(data.items.slice(0, 8), null, 2)}</pre>
          ) : (
            <p className="text-sm text-slate-500">Nenhum registro encontrado para este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}
