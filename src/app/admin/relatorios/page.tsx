"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, BarChart2 } from "lucide-react";

type ReportData = {
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  thisMonthAppointments: number;
  lastMonthAppointments: number;
  [key: string]: any;
};

export default function RelatoriosPage() {
  const [from, setFrom] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchReport(type: string) {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/relatorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, type }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json.error || "Erro ao carregar o relatório");
        setData(null);
        return null;
      }

      setData(json.data as ReportData);
      return json.data as ReportData;
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

    if (!result || !Array.isArray(result) || result.length === 0) {
      setMessage("Nenhum dado para exportar");
      return;
    }

    const rows = result as Array<Record<string, unknown>>;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            const normalized = value == null ? "" : String(value).replace(/"/g, '""');
            return `"${normalized}"`;
          })
          .join(",")
      ),
    ].join("\n");

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

  return (
    <div>
      <AdminHeader title="Relatórios" description="Exportações e comparativos" />

      {message && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
          {message}
        </div>
      )}

      <div className="card">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <div>
            <label className="label">De</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void fetchReport("clientes")} className="btn-secondary">
              Carregar clientes
            </button>
            <button onClick={() => void fetchReport("agendamentos")} className="btn-secondary">
              Carregar agendamentos
            </button>
            <button onClick={() => void fetchReport("financeiro")} className="btn-secondary">
              Carregar financeiro
            </button>
            <button onClick={() => void exportCSV("clientes")} className="btn-primary">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold">Resumo mensal</h3>
          </div>
          {loading && !data ? (
            <p>Carregando resumo...</p>
          ) : data ? (
            <div className="space-y-2">
              <p>Receita este mês: R$ {data.thisMonthRevenue}</p>
              <p>Receita mês anterior: R$ {data.lastMonthRevenue}</p>
              <p>Agendamentos este mês: {data.thisMonthAppointments}</p>
              <p>Agendamentos mês anterior: {data.lastMonthAppointments}</p>
            </div>
          ) : (
            <p>Nenhum resumo disponível.</p>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold">Gráfico comparativo</h3>
          <div className="flex h-48 items-center justify-center text-slate-500">
            {data ? (
              <svg width="100%" height="100%" viewBox="0 0 300 120" preserveAspectRatio="none">
                <rect
                  x="40"
                  y={60 - Math.min(60, (data.thisMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)}
                  width="40"
                  height={Math.min(60, (data.thisMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)}
                  fill="#10b981"
                />
                <rect
                  x="120"
                  y={60 - Math.min(60, (data.lastMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)}
                  width="40"
                  height={Math.min(60, (data.lastMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)}
                  fill="#06b6d4"
                />
                <text x="40" y="105" fontSize="10" fill="#9ca3af">
                  Este mês R$
                </text>
                <text x="120" y="105" fontSize="10" fill="#9ca3af">
                  Mês anterior R$
                </text>
                <rect
                  x="200"
                  y={60 - Math.min(40, (data.thisMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)}
                  width="20"
                  height={Math.min(40, (data.thisMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)}
                  fill="#f59e0b"
                />
                <rect
                  x="230"
                  y={60 - Math.min(40, (data.lastMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)}
                  width="20"
                  height={Math.min(40, (data.lastMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)}
                  fill="#ef4444"
                />
                <text x="200" y="115" fontSize="10" fill="#9ca3af">
                  Este mês (ag.)
                </text>
                <text x="230" y="115" fontSize="10" fill="#9ca3af">
                  Mês ant. (ag.)
                </text>
              </svg>
            ) : (
              <div>Carregando gráfico...</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="mb-3 font-semibold">Resultado</h3>
        <div className="overflow-x-auto">
          <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
