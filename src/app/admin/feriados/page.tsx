"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarOff, CalendarPlus, Clock3, Plus, RefreshCw, Trash2 } from "lucide-react";
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
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/blocked-dates");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("request_failed");
      setItems(data.data);
    } catch {
      setNotice({ type: "error", text: "Não foi possível carregar os bloqueios da agenda." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const metrics = useMemo(() => ({
    total: items.length,
    holidays: items.filter((item) => item.isHoliday).length,
    partial: items.filter((item) => item.blockStart && item.blockEnd).length,
  }), [items]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const response = await fetch("/api/blocked-dates", {
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
      if (!response.ok) throw new Error("request_failed");
      setModalOpen(false);
      setForm(emptyForm);
      setNotice({ type: "success", text: "Bloqueio adicionado à agenda." });
      await load();
    } catch {
      setNotice({ type: "error", text: "Não foi possível registrar esse bloqueio." });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este bloqueio?")) return;
    setNotice(null);
    try {
      const response = await fetch("/api/blocked-dates/" + id, { method: "DELETE" });
      if (!response.ok) throw new Error("request_failed");
      setNotice({ type: "success", text: "Bloqueio removido da agenda." });
      await load();
    } catch {
      setNotice({ type: "error", text: "Não foi possível remover esse bloqueio." });
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Feriados e bloqueios"
        description="Proteja a agenda e evite que o fluxo ofereça horários indisponíveis."
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary gap-2">
            <Plus className="h-4 w-4" />
            Adicionar bloqueio
          </button>
        }
      />

      {notice && (
        <div className={
          notice.type === "success"
            ? "rounded-xl border border-emerald-700/45 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200"
            : "rounded-xl border border-red-700/45 bg-red-950/25 px-4 py-3 text-sm text-red-200"
        }>
          {notice.text}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 text-brand-300 ring-1 ring-brand-700/40"><CalendarOff className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bloqueios</p><p className="mt-1 text-2xl font-semibold text-slate-100">{metrics.total}</p></div>
          </div>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/35 text-amber-400 ring-1 ring-amber-700/40"><CalendarPlus className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Feriados</p><p className="mt-1 text-2xl font-semibold text-slate-100">{metrics.holidays}</p></div>
          </div>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 text-sky-400 ring-1 ring-sky-700/40"><Clock3 className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Parciais</p><p className="mt-1 text-2xl font-semibold text-slate-100">{metrics.partial}</p></div>
          </div>
        </article>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <div>
            <h2 className="font-semibold text-brand-100">Agenda protegida</h2>
            <p className="mt-1 text-sm text-slate-400">Bloqueios registrados e refletidos no agendamento automático.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="btn-secondary gap-2 py-2">
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-300" /></div>
        ) : items.length === 0 ? (
          <div className="py-10"><EmptyState icon={CalendarOff} title="Nenhum feriado ou bloqueio cadastrado" description="A agenda está totalmente disponível conforme os horários de atendimento." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Data</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Motivo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Classificação</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Indisponibilidade</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4 font-medium text-slate-200">{formatDate(item.date)}</td>
                    <td className="px-5 py-4 text-slate-300">{item.reason}</td>
                    <td className="px-5 py-4">
                      <span className={item.isHoliday ? "rounded-full bg-amber-900/35 px-2.5 py-1 text-xs font-semibold text-amber-300" : "rounded-full bg-surface-700 px-2.5 py-1 text-xs font-semibold text-slate-300"}>
                        {item.isHoliday ? "Feriado" : "Bloqueio operacional"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400">{item.blockStart && item.blockEnd ? item.blockStart + " – " + item.blockEnd : "Dia inteiro"}</td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => void handleDelete(item.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-950/40 hover:text-red-200">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Adicionar bloqueio">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
            <label>
              <span className="label">Data *</span>
              <input type="date" className="input" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
            </label>
            <label>
              <span className="label">Motivo *</span>
              <input className="input" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ex.: Natal, reforma, folga" required />
            </label>
          </div>
          <div className="space-y-3 rounded-xl border border-surface-700 bg-surface-850 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={form.isHoliday} onChange={(event) => setForm({ ...form, isHoliday: event.target.checked })} className="h-4 w-4 accent-brand-400" />
              Marcar como feriado
            </label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={form.allDay} onChange={(event) => setForm({ ...form, allDay: event.target.checked })} className="h-4 w-4 accent-brand-400" />
              Bloquear o dia inteiro
            </label>
          </div>
          {!form.allDay && (
            <div className="grid grid-cols-2 gap-4">
              <label><span className="label">Início</span><input type="time" className="input" value={form.blockStart} onChange={(event) => setForm({ ...form, blockStart: event.target.value })} /></label>
              <label><span className="label">Fim</span><input type="time" className="input" value={form.blockEnd} onChange={(event) => setForm({ ...form, blockEnd: event.target.value })} /></label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary">Salvar bloqueio</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
