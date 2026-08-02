"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Car, FileText, Mail, Pencil, Phone, Plus, Search, Trash2, Users } from "lucide-react";
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

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

  const appointmentCount = useMemo(
    () => clients.reduce((total, client) => total + (client._count?.appointments ?? 0), 0),
    [clients]
  );

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
    void load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    void load();
  }

  const renderActions = (client: Client) => (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => openEdit(client)}
        title={`Editar ${client.name}`}
        aria-label={`Editar ${client.name}`}
        className="rounded-lg border border-white/[0.08] bg-surface-800 p-2 text-slate-300 transition hover:border-brand-500/40 hover:bg-brand-900/30 hover:text-brand-200"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDelete(client.id)}
        title={`Excluir ${client.name}`}
        aria-label={`Excluir ${client.name}`}
        className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-2 text-red-300 transition hover:border-red-400/45 hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Clientes"
        eyebrow="Relacionamento e histórico"
        icon={Users}
        description="Sua base de relacionamento, veículos e recorrência em uma visão operacional."
        actions={
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </button>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-surface-850/75 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-4 lg:flex-row lg:items-center lg:justify-between sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400/80">Base CRM</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-brand-100">Clientes e veículos</h2>
            <p className="mt-1 text-sm text-slate-400">Encontre, atualize e mantenha o contexto de cada atendimento.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <div className="rounded-xl border border-brand-500/15 bg-brand-900/20 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400/80">Em exibição</p>
              <p className="mt-0.5 text-lg font-semibold text-brand-100">{clients.length}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-surface-800 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agendamentos</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-200">{appointmentCount}</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <label className="group relative block max-w-2xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition group-focus-within:text-brand-300" />
            <input
              className="input h-11 border-white/[0.09] bg-surface-900/70 pl-10 pr-4"
              placeholder="Buscar por nome, telefone, veículo ou placa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Atualizando base de clientes...</div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum cliente encontrado"
            description={search ? "Ajuste a busca ou cadastre um novo cliente." : "Cadastre seu primeiro cliente para iniciar a operação."}
            action={
              !search ? (
                <button type="button" onClick={openCreate} className="btn-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar cliente
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 p-4 pt-0 md:hidden">
              {clients.map((client) => (
                <article key={client.id} className="rounded-xl border border-white/[0.07] bg-surface-900/60 p-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/45 text-xs font-bold text-brand-200 ring-1 ring-brand-700/30">
                      {initials(client.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-100">{client.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Phone className="h-3 w-3" />{client.phone}</p>
                    </div>
                    {renderActions(client)}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 text-slate-400"><Car className="h-3.5 w-3.5 text-brand-400" /><span className="truncate">{client.vehicleModel || "Sem veículo"}</span></div>
                    <div className="text-right text-slate-400"><span className="font-semibold text-brand-200">{client._count?.appointments ?? 0}</span> agend.</div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-y border-white/[0.06] bg-surface-900/45 text-left">
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Cliente</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Contato</th>
                    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Veículo</th>
                    <th className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Histórico</th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="group border-b border-white/[0.055] transition hover:bg-brand-900/[0.07]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/45 text-xs font-bold text-brand-200 ring-1 ring-brand-700/30">
                            {initials(client.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-100">{client.name}</p>
                            {client.notes ? <p className="mt-0.5 max-w-[230px] truncate text-xs text-slate-500">{client.notes}</p> : <p className="mt-0.5 text-xs text-slate-600">Sem observações</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="flex items-center gap-1.5 text-slate-300"><Phone className="h-3.5 w-3.5 text-slate-500" />{client.phone}</p>
                        {client.email ? <p className="mt-1 flex max-w-[205px] items-center gap-1.5 truncate text-xs text-slate-500"><Mail className="h-3.5 w-3.5 shrink-0" />{client.email}</p> : <p className="mt-1 text-xs text-slate-600">E-mail não informado</p>}
                      </td>
                      <td className="px-5 py-4">
                        <p className="flex items-center gap-1.5 font-medium text-slate-300"><Car className="h-3.5 w-3.5 text-brand-400" />{client.vehicleModel || "Não informado"}</p>
                        {client.vehiclePlate && <span className="ml-5 mt-1 inline-flex rounded-md border border-white/[0.08] bg-surface-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">{client.vehiclePlate}</span>}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex min-w-9 items-center justify-center rounded-lg border border-brand-500/15 bg-brand-900/25 px-2 py-1 text-xs font-semibold text-brand-200">{client._count?.appointments ?? 0}</span>
                      </td>
                      <td className="px-5 py-4">{renderActions(client)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Atualizar cliente" : "Novo cliente"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="-mt-1 text-sm leading-6 text-slate-400">
            {editing ? "Mantenha os dados de relacionamento e veículo sempre atualizados." : "Registre os dados essenciais para personalizar cada atendimento."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Nome completo *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Telefone *</label>
              <input className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <label className="label">E-mail</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-surface-900/50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-100"><Car className="h-4 w-4 text-brand-400" />Veículo principal</div>
            <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
              <div>
                <label className="label">Modelo</label>
                <input className="input" placeholder="Ex.: Honda Civic" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
              </div>
              <div>
                <label className="label">Placa</label>
                <input className="input uppercase" placeholder="ABC1D23" value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value.toUpperCase() })} />
              </div>
            </div>
          </div>

          <div>
            <label className="label"><FileText className="mr-1 inline h-3.5 w-3.5" />Observações internas</label>
            <textarea className="input resize-y" rows={3} placeholder="Preferências, histórico, cuidados especiais..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary">{editing ? "Salvar alterações" : "Cadastrar cliente"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
