"use client";

import { useEffect, useState } from "react";
import { Plus, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

export default function FinanceiroPage() {
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [summary, setSummary] = useState<Array<{ type: string; _sum: { amount: string | null } }>>([]);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const res = await fetch(`/api/financeiro?month=${month}`);
    const data = await res.json();
    if (data.success) {
      setRecords(data.data.records);
      setSummary(data.data.summary);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
  }, [month]);

  const income = Number(summary.find((s) => s.type === "INCOME")?._sum.amount ?? 0);
  const expenses = Number(summary.find((s) => s.type === "EXPENSE")?._sum.amount ?? 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/financeiro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount),
      }),
    });
    setModalOpen(false);
    setForm(emptyForm);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este registro?")) return;
    await fetch(`/api/financeiro/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Financeiro"
        description="Controle de receitas e despesas"
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo lançamento
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Mês</label>
          <input type="month" className="input max-w-xs" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="card flex gap-8 py-3">
          <div>
            <p className="text-xs text-slate-500">Receitas</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(income)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Despesas</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(expenses)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Saldo</p>
            <p className="text-lg font-bold">{formatCurrency(income - expenses)}</p>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : records.length === 0 ? (
          <EmptyState icon={DollarSign} title="Nenhum lançamento neste mês" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Data</th>
                <th className="pb-3 font-medium">Descrição</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Valor</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-3">{formatDate(r.date)}</td>
                  <td className="py-3">{r.description}</td>
                  <td className="py-3">
                    <StatusBadge status={r.type} />
                  </td>
                  <td className={`py-3 font-medium ${r.type === "INCOME" ? "text-green-600" : "text-red-600"}`}>
                    {r.type === "EXPENSE" ? "-" : "+"}
                    {formatCurrency(Number(r.amount))}
                  </td>
                  <td className="py-3">
                    <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:underline">
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo lançamento">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="INCOME">Receita</option>
              <option value="EXPENSE">Despesa</option>
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="SERVICE">Serviço</option>
              <option value="PRODUCT">Produto</option>
              <option value="SALARY">Salário</option>
              <option value="RENT">Aluguel</option>
              <option value="UTILITIES">Utilidades</option>
              <option value="SUPPLIES">Suprimentos</option>
              <option value="OTHER">Outro</option>
            </select>
          </div>
          <div>
            <label className="label">Valor (R$) *</label>
            <input className="input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </div>
          <div>
            <label className="label">Descrição *</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
