"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  active: boolean;
}

const emptyForm = { name: "", description: "", price: "", durationMin: "60", active: true };

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const res = await fetch("/api/servicos");
    const data = await res.json();
    if (data.success) setServices(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description ?? "",
      price: String(service.price),
      durationMin: String(service.durationMin),
      active: service.active,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price),
      durationMin: parseInt(form.durationMin),
      active: form.active,
    };

    const url = editing ? `/api/servicos/${editing.id}` : "/api/servicos";
    await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Desativar este serviço?")) return;
    await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Serviços"
        description="Gerencie os serviços oferecidos"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo serviço
          </button>
        }
      />

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : services.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhum serviço cadastrado" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium">Preço</th>
                <th className="pb-3 font-medium">Duração</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                  </td>
                  <td className="py-3">{formatCurrency(Number(s.price))}</td>
                  <td className="py-3">{s.durationMin} min</td>
                  <td className="py-3">
                    <span className={s.active ? "text-green-600" : "text-red-600"}>
                      {s.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="rounded p-1 hover:bg-slate-100">
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="rounded p-1 hover:bg-red-50">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar serviço" : "Novo serviço"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Preço (R$) *</label>
              <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div>
              <label className="label">Duração (min) *</label>
              <input className="input" type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span className="text-sm">Serviço ativo</span>
          </label>
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
