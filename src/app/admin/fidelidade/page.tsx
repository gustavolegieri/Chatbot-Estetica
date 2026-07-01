"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default function FidelidadePage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/coupons');
    const json = await res.json();
    if (json.success) setCoupons(json.data || []);
  }

  async function create() {
    const res = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const json = await res.json();
    if (!json.success) return alert('Erro');
    setForm({ code: "", type: "percent", amount: "10", validFrom: "", validTo: "", usageLimit: "", usagePerCustomer: "1", active: true });
    load();
  }

  return (
    <div>
      <AdminHeader title="Fidelidade e Cupons" description="Crie e gerencie cupons" />

      <div className="card">
        <h3 className="font-semibold mb-2">Criar cupom</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="percent">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
          <input className="input" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="input" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
          <input className="input" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
          <input className="input" placeholder="Uso total" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
          <input className="input" placeholder="Uso por cliente" value={form.usagePerCustomer} onChange={(e) => setForm({ ...form, usagePerCustomer: e.target.value })} />
          <div className="flex items-center gap-2">
            <label className="label">Ativo</label>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          </div>
          <div className="flex">
            <button className="btn-primary" onClick={create}>Criar</button>
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="font-semibold mb-3">Cupons</h3>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Período</th>
              <th>Uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b">
                <td>{c.code}</td>
                <td>{c.type}</td>
                <td>{c.amount}</td>
                <td>{c.validFrom ? new Date(c.validFrom).toLocaleDateString() : '-'} → {c.validTo ? new Date(c.validTo).toLocaleDateString() : '-'}</td>
                <td>{c.usageLimit ?? '-'} / per client: {c.usagePerCustomer ?? 1}</td>
                <td>
                  <button className="btn-secondary" onClick={async () => { if (!confirm('Remover cupom?')) return; await fetch(`/api/coupons/${c.id}`, { method: 'DELETE' }); load(); }}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
