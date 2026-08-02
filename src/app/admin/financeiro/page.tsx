"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
} from "lucide-react";
import { format } from "date-fns";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";

interface FinancialRecord {
  id: string;
  type: string;
  category: string;
  amount: string;
  description: string;
  date: string;
}

const emptyForm = {
  type: "INCOME",
  category: "OTHER",
  amount: "",
  description: "",
  date: format(new Date(), "yyyy-MM-dd"),
};

const categoryLabels: Record<string, string> = {
  SERVICE: "Serviço",
  PRODUCT: "Produto",
  SALARY: "Folha",
  RENT: "Aluguel",
  UTILITIES: "Utilidades",
  SUPPLIES: "Suprimentos",
  OTHER: "Outro",
};

export default function FinanceiroPage() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [summary, setSummary] = useState<Array<{ type: string; _sum: { amount: string | null } }>>([]);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/financeiro?month=" + month);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("request_failed");
      setRecords(data.data.records);
      setSummary(data.data.summary);
    } catch {
      setNotice({ type: "error", text: "Não foi possível carregar os dados financeiros." });
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const income = Number(summary.find((item) => item.type === "INCOME")?._sum.amount ?? 0);
  const expenses = Number(summary.find((item) => item.type === "EXPENSE")?._sum.amount ?? 0);
  const balance = income - expenses;
  const totalEntries = useMemo(() => records.length, [records.length]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const response = await fetch("/api/financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (!response.ok) throw new Error("request_failed");
      setModalOpen(false);
      setForm(emptyForm);
      setNotice({ type: "success", text: "Lançamento registrado no financeiro." });
      await load();
    } catch {
      setNotice({ type: "error", text: "Não foi possível registrar esse lançamento." });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    setNotice(null);
    try {
      const response = await fetch("/api/financeiro/" + id, { method: "DELETE" });
      if (!response.ok) throw new Error("request_failed");
      setNotice({ type: "success", text: "Lançamento removido." });
      await load();
    } catch {
      setNotice({ type: "error", text: "Não foi possível excluir o lançamento." });
    }
  }

  const metricCards = [
    { label: "Receitas", value: income, helper: "Entradas no período", icon: ArrowUpRight, tone: "emerald" },
    { label: "Despesas", value: expenses, helper: "Saídas no período", icon: ArrowDownRight, tone: "red" },
    { label: "Saldo projetado", value: balance, helper: balance >= 0 ? "Operação positiva" : "Atenção ao caixa", icon: WalletCards, tone: balance >= 0 ? "brand" : "amber" },
  ];

  const toneClasses: Record<string, string> = {
    emerald: "bg-emerald-900/35 text-emerald-400 ring-emerald-700/40",
    red: "bg-red-900/35 text-red-400 ring-red-700/40",
    brand: "bg-brand-900/40 text-brand-300 ring-brand-700/40",
    amber: "bg-amber-900/40 text-amber-400 ring-amber-700/40",
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Financeiro"
        description="Acompanhe o caixa da operação e registre receitas ou despesas."
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary gap-2">
            <Plus className="h-4 w-4" />
            Novo lançamento
          </button>
        }
      />

      {notice && (
        <div className={
          notice.type === "success"
            ? "flex items-center gap-3 rounded-xl border border-emerald-700/45 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200"
            : "flex items-center gap-3 rounded-xl border border-red-700/45 bg-red-950/25 px-4 py-3 text-sm text-red-200"
        }>
          <CircleDollarSign className="h-4 w-4" />
          {notice.text}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_0.9fr]">
        {metricCards.map(({ label, value, helper, icon: Icon, tone }) => (
          <article key={label} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">{formatCurrency(value)}</p>
                <p className="mt-1 text-xs text-slate-500">{helper}</p>
              </div>
              <div className={"flex h-10 w-10 items-center justify-center rounded-xl ring-1 " + toneClasses[tone]}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </article>
        ))}
        <article className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">Movimentações</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{totalEntries}</p>
              <p className="mt-1 text-xs text-slate-500">Lançamentos no recorte</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 text-sky-400 ring-1 ring-sky-700/40">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </article>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-surface-700 px-5 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-semibold text-brand-100">Livro caixa</h2>
            <p className="mt-1 text-sm text-slate-400">Todos os registros financeiros do período selecionado.</p>
          </div>
          <div className="flex items-end gap-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Competência</span>
              <input type="month" className="input min-w-44 py-2" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <button onClick={() => void load()} disabled={loading} className="btn-secondary mb-0.5 gap-2 py-2">
              <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
              Atualizar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-brand-300" />
          </div>
        ) : records.length === 0 ? (
          <div className="py-10">
            <EmptyState icon={CircleDollarSign} title="Nenhum lançamento neste período" description="Registre entradas e saídas para acompanhar o caixa." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Descrição</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Categoria</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Movimento</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Valor</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ação</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const isIncome = record.type === "INCOME";
                  return (
                    <tr key={record.id}>
                      <td className="px-5 py-4 text-slate-400">{formatDate(record.date)}</td>
                      <td className="px-5 py-4 font-medium text-slate-200">{record.description}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-surface-700 px-2.5 py-1 text-xs font-medium text-slate-400">
                          {categoryLabels[record.category] || record.category}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={
                          isIncome
                            ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-900/35 px-2.5 py-1 text-xs font-semibold text-emerald-300"
                            : "inline-flex items-center gap-1.5 rounded-full bg-red-900/35 px-2.5 py-1 text-xs font-semibold text-red-300"
                        }>
                          {isIncome ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {isIncome ? "Receita" : "Despesa"}
                        </span>
                      </td>
                      <td className={isIncome ? "px-5 py-4 text-right font-semibold text-emerald-400" : "px-5 py-4 text-right font-semibold text-red-400"}>
                        {isIncome ? "+" : "-"}{formatCurrency(Number(record.amount))}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => void handleDelete(record.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-950/40 hover:text-red-200">
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo lançamento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Tipo *</span>
              <select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
            </label>
            <label>
              <span className="label">Categoria</span>
              <select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="label">Valor (R$) *</span>
              <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
            </label>
            <label>
              <span className="label">Data</span>
              <input type="date" className="input" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            </label>
          </div>
          <label>
            <span className="label">Descrição *</span>
            <input className="input" placeholder="Ex.: pacote de higienização" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary">Registrar lançamento</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
