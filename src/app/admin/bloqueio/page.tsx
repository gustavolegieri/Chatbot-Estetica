"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";

interface BlockedPhone {
  id: string;
  phone: string;
  reason: string;
  createdAt: string;
}

const emptyForm = { phone: "", reason: "" };

export default function BloqueioPage() {
  const [items, setItems] = useState<BlockedPhone[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/blocked-phones");
      const json = await res.json();
      if (json.success) setItems(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = items.filter((i) => {
    const q = search.trim();
    if (!q) return true;
    return i.phone.includes(q) || (i.reason ?? "").toLowerCase().includes(q.toLowerCase());
  });

  function openCreate() {
    setForm(emptyForm);
    setMsg(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const phone = form.phone.trim();
    const reason = form.reason.trim() || "Bloqueado pelo administrador";

    if (!phone || phone.length < 5) {
      setMsg({ type: "error", text: "Informe um telefone válido." });
      return;
    }

    const res = await fetch("/api/blocked-phones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, reason }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      setMsg({ type: "error", text: json.error || "Erro ao criar bloqueio" });
      return;
    }

    setModalOpen(false);
    setMsg({ type: "success", text: "Número bloqueado." });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Desbloquear este número?")) return;
    await fetch(`/api/blocked-phones/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Bloqueio" description="Números que você não quer que o bot responda automaticamente" />

      {msg && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-gold ${
            msg.type === "success"
              ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
              : "border-red-700/50 bg-red-950/40 text-red-300"
          }`}
        >
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-[520px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Buscar por telefone ou motivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={openCreate} className="btn-primary gap-2 px-6 py-3">
            <Plus className="h-4 w-4" /> Bloquear número
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum bloqueio" description="Adicione números para impedir respostas automáticas do bot" icon={Trash2} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-900/40 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 pr-4">Telefone</th>
                  <th className="py-3 pr-4">Motivo</th>
                  <th className="py-3 pr-4">Criado</th>
                  <th className="py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-b border-surface-700/80 transition hover:bg-surface-750/40">
                    <td className="py-3 pr-4 font-medium text-slate-200">{i.phone}</td>
                    <td className="py-3 pr-4 text-slate-300">{i.reason}</td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(i.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="py-3">
                      <button
                        className="btn-secondary gap-2 px-3 py-2 text-xs"
                        onClick={() => void handleDelete(i.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" /> Desbloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Bloquear número">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Telefone *</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Bloquear
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

