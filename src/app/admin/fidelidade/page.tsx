"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Plus, Trash2, Gift, Percent, Tag, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";

export default function FidelidadePage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/coupons');
    const json = await res.json();
    if (json.success) setCoupons(json.data || []);
  }

  async function create() {
    if (!form.code.trim()) {
      setMessage({ text: "Digite um código para o cupom.", type: "error" });
      return;
    }
    const res = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    if (!json.success) {
      setMessage({ text: json.error || "Erro ao criar cupom.", type: "error" });
      return;
    }
    setMessage({ text: "✅ Cupom criado com sucesso!", type: "success" });
    setForm({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Remover este cupom?')) return;
    await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    setMessage({ text: "🗑️ Cupom removido.", type: "success" });
    load();
  }

  const activeCoupons = coupons.filter(c => c.active).length;

  return (
    <div className="space-y-6">
      <AdminHeader title="Fidelidade e Cupons" description="Crie descontos e promoções para seus clientes" />

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg ${
          message.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Gift className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total de cupons</p>
              <p className="text-2xl font-bold text-slate-800">{coupons.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Ativos</p>
              <p className="text-2xl font-bold text-slate-800">{activeCoupons}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <Percent className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Tipos</p>
              <p className="text-2xl font-bold text-slate-800">
                {coupons.filter(c => c.type === "percent").length}% / {coupons.filter(c => c.type === "fixed").length}R$
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Botão criar */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600"
      >
        <Plus className="h-4 w-4" />
        {showForm ? "Fechar" : "Novo cupom"}
      </button>

      {/* Formulário */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Tag className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Novo cupom de desconto</h2>
              <p className="text-sm text-slate-500">Defina as regras do cupom</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Código</label>
              <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 uppercase" placeholder="Ex: PROMO10" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Tipo</label>
              <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percent">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Valor</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{form.type === "percent" ? "%" : "R$"}</span>
                <input className="w-full rounded-xl border border-slate-300 px-8 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="10" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Válido de</label>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Válido até</label>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Limite de usos</label>
              <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="Ilimitado" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Usos por cliente</label>
              <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={form.usagePerCustomer} onChange={(e) => setForm({ ...form, usagePerCustomer: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <label className="relative h-7 w-12 cursor-pointer">
                <div className={`h-7 w-12 rounded-full transition ${form.active ? "bg-brand-500" : "bg-slate-300"}`}>
                  <div className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${form.active ? "translate-x-5" : ""}`} />
                </div>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="hidden" />
              </label>
              <span className="text-sm font-medium text-slate-700">Ativo</span>
            </div>
            <div className="flex items-end">
              <button className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600" onClick={create}>
                <Plus className="h-4 w-4" /> Criar cupom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Gift className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Cupons cadastrados</h2>
            <p className="text-sm text-slate-500">Gerencie os descontos disponíveis</p>
          </div>
        </div>

        {coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Gift className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium">Nenhum cupom ainda</p>
            <p className="text-xs">Clique em &quot;Novo cupom&quot; para criar o primeiro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 pr-4">Código</th>
                  <th className="py-3 pr-4">Tipo</th>
                  <th className="py-3 pr-4">Valor</th>
                  <th className="py-3 pr-4">Período</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3"></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono font-bold text-slate-800">{c.code}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {c.type === "percent" ? <Percent className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                        {c.type === "percent" ? "Percentual" : "Fixo"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold">{c.type === "percent" ? `${c.amount}%` : `R$ ${c.amount}`}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : "—"} → {c.validTo ? new Date(c.validTo).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="py-3">
                      <button onClick={() => remove(c.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}