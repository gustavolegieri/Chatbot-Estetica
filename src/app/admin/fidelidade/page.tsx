"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Plus, Trash2, Gift, Percent, Tag, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";

export default function FidelidadePage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/coupons');
    const json = await res.json();
    if (json.success) setCoupons(json.data || []);
  }

  async function create() {
    if (!form.code.trim()) { setMsg({ text: "Digite um código.", type: "error" }); return; }
    const res = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    if (!json.success) { setMsg({ text: json.error || "Erro ao criar.", type: "error" }); return; }
    setMsg({ text: "✅ Cupom criado!", type: "success" });
    setForm({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });
    setShowForm(false); load();
  }

  async function remove(id: string) {
    if (!confirm('Remover este cupom?')) return;
    await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    setMsg({ text: "🗑️ Cupom removido.", type: "success" }); load();
  }

  const activeCoupons = coupons.filter(c => c.active).length;

  return (
    <div className="space-y-6">
      <AdminHeader title="Fidelidade e Cupons" description="Crie descontos e promoções para seus clientes" />

      {msg && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-gold ${
          msg.type === "success" ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300" : "border-red-700/50 bg-red-950/40 text-red-300"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-red-400" />}
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <Gift className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total de cupons</p>
              <p className="text-2xl font-bold text-brand-200">{coupons.length}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/40 ring-1 ring-emerald-700/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Ativos</p>
              <p className="text-2xl font-bold text-brand-200">{activeCoupons}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
              <Percent className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">% / R$</p>
              <p className="text-2xl font-bold text-brand-200">{coupons.filter(c => c.type === "percent").length}% / {coupons.filter(c => c.type === "fixed").length}R$</p>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setShowForm(!showForm)} className="btn-primary gap-2 px-6 py-3">
        <Plus className="h-4 w-4" /> {showForm ? "Fechar" : "Novo cupom"}
      </button>

      {showForm && (
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <Tag className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Novo cupom de desconto</h2>
              <p className="text-sm text-slate-400">Defina as regras do cupom</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Código</label>
              <input className="input uppercase" placeholder="Ex: PROMO10" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percent">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label className="label">Valor</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{form.type === "percent" ? "%" : "R$"}</span>
                <input className="input pl-8" placeholder="10" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Válido de</label>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <input className="input" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Válido até</label>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <input className="input" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Limite de usos</label>
              <input className="input" placeholder="Ilimitado" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
            </div>
            <div>
              <label className="label">Usos por cliente</label>
              <input className="input" value={form.usagePerCustomer} onChange={(e) => setForm({ ...form, usagePerCustomer: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <label className="relative h-7 w-12 cursor-pointer">
                <div className={`h-7 w-12 rounded-full transition ${form.active ? "bg-brand-500" : "bg-surface-500"}`}>
                  <div className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${form.active ? "translate-x-5" : ""}`} />
                </div>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="hidden" />
              </label>
              <span className="text-sm font-medium text-slate-300">Ativo</span>
            </div>
            <div className="flex items-end">
              <button className="btn-primary gap-2 px-6 py-3" onClick={create}><Plus className="h-4 w-4" /> Criar cupom</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-900/40 ring-1 ring-purple-700/30">
            <Gift className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Cupons cadastrados</h2>
            <p className="text-sm text-slate-400">Gerencie os descontos disponíveis</p>
          </div>
        </div>

        {coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Gift className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhum cupom ainda</p>
            <p className="text-xs">Clique em &quot;Novo cupom&quot; para criar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-900/40 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                  <tr key={c.id} className="border-b border-surface-700/80 transition hover:bg-surface-750/40">
                    <td className="py-3 pr-4 font-mono font-bold text-brand-200">{c.code}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-700 px-2.5 py-1 text-xs font-medium text-slate-300">
                        {c.type === "percent" ? <Percent className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                        {c.type === "percent" ? "Percentual" : "Fixo"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-200">{c.type === "percent" ? `${c.amount}%` : `R$ ${c.amount}`}</td>
                    <td className="py-3 pr-4 text-slate-400">
                      {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : "—"} → {c.validTo ? new Date(c.validTo).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${c.active ? "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50" : "bg-surface-700 text-slate-400"}`}>
                        {c.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="py-3">
                      <button onClick={() => remove(c.id)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-950/40">
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