"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, BarChart2 } from "lucide-react";

export default function RelatoriosPage() {
  const [from, setFrom] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
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
        setMessage(json.error || "Erro");
      } else {
        setData(json.data);
      }
    } catch {
      setMessage("Erro de conexão");
            setData(json.data);
            return json.data;
      setLoading(false);
    }
  }

  async function exportCSV(type: string) {
    setLoading(true);
    await fetchReport(type);
    if (!data) {
      setLoading(false);
      return;
        const result = await fetchReport(type);
        const rows = result ?? data;
        if (!rows || rows.length === 0) {
          setLoading(false);
          setMessage("Nenhum dado para exportar");
          return;
        }
    a.href = url;
    a.download = `${type}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  useEffect(() => {
    fetchReport("summary");
  }, []);

  return (
    <div>
      <AdminHeader title="Relatórios" description="Exportações e comparativos" />

      {message && <div className="mb-4 rounded border bg-amber-50 px-4 py-2 text-amber-900">{message}</div>}

      <div className="card">
        <div className="grid gap-4 sm:grid-cols-3 items-end">
          <div>
            <label className="label">De</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchReport("clientes")} className="btn-secondary">Carregar clientes</button>
            <button onClick={() => fetchReport("agendamentos")} className="btn-secondary">Carregar agendamentos</button>
            <button onClick={() => fetchReport("financeiro")} className="btn-secondary">Carregar financeiro</button>
            <button onClick={() => exportCSV("clientes")} className="btn-primary"><Download className="mr-2 h-4 w-4"/>Exportar CSV</button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-semibold">Resumo mensal</h3>
          {data ? (
            <div>
              <p>Receita este mês: R$ {data.thisMonthRevenue}</p>
              <p>Receita mês anterior: R$ {data.lastMonthRevenue}</p>
              <p>Agendamentos este mês: {data.thisMonthAppointments}</p>
              <p>Agendamentos mês anterior: {data.lastMonthAppointments}</p>
            </div>
          ) : (
            <p>Carregando resumo...</p>
          )}
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold">Gráfico comparativo</h3>
          <div className="h-48 flex items-center justify-center text-slate-500">
            {data ? (
              <svg width="100%" height="100%" viewBox="0 0 300 120" preserveAspectRatio="none">
                {/* revenue bars */}
                <rect x="40" y={60 - Math.min(60, (data.thisMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)} width="40" height={Math.min(60, (data.thisMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)} fill="#10b981" />
                <rect x="120" y={60 - Math.min(60, (data.lastMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)} width="40" height={Math.min(60, (data.lastMonthRevenue / Math.max(1, data.thisMonthRevenue + data.lastMonthRevenue)) * 60)} fill="#06b6d4" />
                <text x="40" y="105" fontSize="10" fill="#9ca3af">Este mês R$</text>
                <text x="120" y="105" fontSize="10" fill="#9ca3af">Mês anterior R$</text>

                {/* appointments bars */}
                <rect x="200" y={60 - Math.min(40, (data.thisMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)} width="20" height={Math.min(40, (data.thisMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)} fill="#f59e0b" />
                <rect x="230" y={60 - Math.min(40, (data.lastMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)} width="20" height={Math.min(40, (data.lastMonthAppointments / Math.max(1, data.thisMonthAppointments + data.lastMonthAppointments)) * 40)} fill="#ef4444" />
                <text x="200" y="115" fontSize="10" fill="#9ca3af">Este mês (ag.)</text>
                <text x="230" y="115" fontSize="10" fill="#9ca3af">Mês ant. (ag.)</text>
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
