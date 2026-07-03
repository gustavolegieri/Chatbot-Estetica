"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, Users } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  notes: string | null;
  _count?: { appointments: number };
}

const emptyForm = { name: "", phone: "", email: "", vehiclePlate: "", vehicleModel: "", notes: "" };

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clientes?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (data.success) setClients(data.data);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    setForm({
      name: client.name,
      phone: client.phone,
      email: client.email ?? "",
      vehiclePlate: client.vehiclePlate ?? "",
      vehicleModel: client.vehicleModel ?? "",
      notes: client.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `/api/clientes/${editing.id}` : "/api/clientes";
    const method = editing ? "PUT" : "POST";

    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Clientes"
        description="Gerencie sua base de clientes"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </button>
        }
      />

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por nome, telefone ou placa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : clients.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Cadastre seu primeiro cliente" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium">Telefone</th>
                <th className="pb-3 font-medium">Veículo</th>
                <th className="pb-3 font-medium">Agendamentos</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3">{c.phone}</td>
                  <td className="py-3">
                    {c.vehicleModel ?? "-"}
                    {c.vehiclePlate && ` (${c.vehiclePlate})`}
                  </td>
                  <td className="py-3">{c._count?.appointments ?? 0}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="rounded p-1 hover:bg-slate-100">
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="rounded p-1 hover:bg-red-50">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar cliente" : "Novo cliente"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Telefone *</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Modelo do veículo</label>
              <input className="input" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
            </div>
            <div>
              <label className="label">Placa</label>
              <input className="input" value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
