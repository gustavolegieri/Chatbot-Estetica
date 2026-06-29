"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, CalendarOff } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";

interface BlockedDate {
  id: string;
  date: string;
  reason: string;
  isHoliday: boolean;
  blockStart: string | null;
  blockEnd: string | null;
}

const emptyForm = {
  date: "",
  reason: "",
  isHoliday: false,
  blockStart: "",
  blockEnd: "",
  allDay: true,
};

export default function FeriadosPage() {
  const [items, setItems] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const res = await fetch("/api/blocked-dates");
    const data = await res.json();
    if (data.success) setItems(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/blocked-dates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        reason: form.reason,
        isHoliday: form.isHoliday,
        blockStart: form.allDay ? null : form.blockStart || null,
        blockEnd: form.allDay ? null : form.blockEnd || null,
      }),
    });
    setModalOpen(false);
    setForm(emptyForm);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este bloqueio?")) return;
    await fetch(`/api/blocked-dates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Feriados e bloqueios"
        description="Dias em que a agenda fica fechada ou com horários reduzidos"
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </button>
        }
      />

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarOff} title="Nenhum feriado ou bloqueio cadastrado" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Data</th>
                <th className="pb-3 font-medium">Motivo</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Horário</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium">{formatDate(item.date)}</td>
                  <td className="py-3">{item.reason}</td>
                  <td className="py-3">
                    {item.isHoliday ? (
                      <span className="text-amber-600">Feriado</span>
                    ) : (
                      <span className="text-slate-600">Bloqueio</span>
                    )}
                  </td>
                  <td className="py-3">
                    {item.blockStart && item.blockEnd
                      ? `${item.blockStart} – ${item.blockEnd}`
                      : "Dia inteiro"}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded p-1 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo bloqueio">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Data *</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Motivo *</label>
            <input
              className="input"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex: Natal, Reforma, Folga"
              required
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isHoliday}
              onChange={(e) => setForm({ ...form, isHoliday: e.target.checked })}
            />
            <span className="text-sm">Marcar como feriado</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
            />
            <span className="text-sm">Bloquear dia inteiro</span>
          </label>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Início do bloqueio</label>
                <input
                  type="time"
                  className="input"
                  value={form.blockStart}
                  onChange={(e) => setForm({ ...form, blockStart: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Fim do bloqueio</label>
                <input
                  type="time"
                  className="input"
                  value={form.blockEnd}
                  onChange={(e) => setForm({ ...form, blockEnd: e.target.value })}
                />
              </div>
            </div>
          )}
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
