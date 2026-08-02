"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Plus, UserRound } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { brDateToIso, isoToBrDate, maskBrDateInput, todayIsoLocal } from "@/lib/date-br";

interface Appointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  client: { id: string; name: string };
  service: { id: string; name: string; durationMin: number };
}

interface Client {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  durationMin: number;
}

const statuses = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"];
const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

export default function AgendamentosPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterDate, setFilterDate] = useState(todayIsoLocal());
  const [filterDateBr, setFilterDateBr] = useState(isoToBrDate(todayIsoLocal()));
  const [form, setForm] = useState({
    clientId: "",
    serviceId: "",
    date: todayIsoLocal(),
    dateBr: isoToBrDate(todayIsoLocal()),
    startTime: "",
    status: "CONFIRMED",
    notes: "",
  });

  const load = useCallback(async () => {
    const [aptRes, cliRes, svcRes] = await Promise.all([
      fetch(`/api/agendamentos?date=${filterDate}`),
      fetch("/api/clientes"),
      fetch("/api/servicos?active=true"),
    ]);
    const [apt, cli, svc] = await Promise.all([aptRes.json(), cliRes.json(), svcRes.json()]);
    if (apt.success) setAppointments(apt.data);
    if (cli.success) setClients(cli.data);
    if (svc.success) setServices(svc.data);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (form.serviceId && form.date) {
      fetch(`/api/agendamentos/slots?date=${form.date}&serviceId=${form.serviceId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setSlots(res.data);
        });
    }
  }, [form.serviceId, form.date]);

  const metrics = useMemo(() => {
    const confirmed = appointments.filter((appointment) => appointment.status === "CONFIRMED").length;
    const inProgress = appointments.filter((appointment) => appointment.status === "IN_PROGRESS").length;
    const completed = appointments.filter((appointment) => appointment.status === "COMPLETED").length;
    const minutes = appointments
      .filter((appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status))
      .reduce((total, appointment) => total + appointment.service.durationMin, 0);
    return { confirmed, inProgress, completed, minutes };
  }, [appointments]);

  function openCreate() {
    setForm((current) => ({ ...current, date: filterDate, dateBr: filterDateBr, startTime: "", serviceId: "", clientId: "", notes: "", status: "CONFIRMED" }));
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateIso = brDateToIso(form.dateBr);
    if (!dateIso) {
      alert("Data inválida. Use o formato dd/mm/aaaa");
      return;
    }
    const res = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, date: dateIso }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error ?? "Erro ao agendar");
      return;
    }
    setModalOpen(false);
    void load();
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/agendamentos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error ?? "Erro ao atualizar status");
      return;
    }
    void load();
  }

  const renderStatusControl = (appointment: Appointment) => (
    <select
      aria-label={`Atualizar status do agendamento de ${appointment.client.name}`}
      className="rounded-lg border border-white/[0.09] bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
      value={appointment.status}
      onChange={(e) => updateStatus(appointment.id, e.target.value)}
    >
      {statuses.map((status) => (
        <option key={status} value={status}>{statusLabels[status]}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Agenda operacional"
        eyebrow="Planejamento do dia"
        icon={CalendarDays}
        description="Acompanhe os atendimentos, atualize cada etapa e mantenha sua operação no ritmo certo."
        actions={
          <button type="button" onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo agendamento
          </button>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-surface-850/75 shadow-[0_16px_44px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-400/80">Visão diária</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-brand-100">Agenda de {filterDateBr}</h2>
            <p className="mt-1 text-sm text-slate-400">Selecione uma data para organizar sua fila de serviços.</p>
          </div>
          <label className="group relative block w-full max-w-xs">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Data da agenda</span>
            <CalendarDays className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-500 transition group-focus-within:text-brand-300" />
            <input
              type="text"
              inputMode="numeric"
              className="input h-11 border-white/[0.09] bg-surface-900/70 pl-10"
              placeholder="dd/mm/aaaa"
              value={filterDateBr}
              onChange={(e) => {
                const masked = maskBrDateInput(e.target.value);
                setFilterDateBr(masked);
                const iso = brDateToIso(masked);
                if (iso) setFilterDate(iso);
              }}
              onBlur={() => {
                const iso = brDateToIso(filterDateBr);
                if (!iso) setFilterDateBr(isoToBrDate(filterDate));
              }}
            />
          </label>
        </div>

        <div className="grid gap-px bg-white/[0.055] sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-surface-850/80 px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total na agenda</p><p className="mt-1 text-2xl font-semibold text-brand-100">{appointments.length}</p></div>
          <div className="bg-surface-850/80 px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Confirmados</p><p className="mt-1 text-2xl font-semibold text-blue-300">{metrics.confirmed}</p></div>
          <div className="bg-surface-850/80 px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Em execução</p><p className="mt-1 text-2xl font-semibold text-violet-300">{metrics.inProgress}</p></div>
          <div className="bg-surface-850/80 px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Carga prevista</p><p className="mt-1 text-2xl font-semibold text-brand-200">{metrics.minutes} <span className="text-sm font-medium text-slate-500">min</span></p></div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando agenda...</div>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum agendamento nesta data"
            description="A data está livre para novos atendimentos."
            action={<button type="button" onClick={openCreate} className="btn-primary"><Plus className="mr-2 h-4 w-4" />Criar agendamento</button>}
          />
        ) : (
          <>
            <div className="space-y-3 p-4 sm:p-5 md:hidden">
              {appointments.map((appointment) => (
                <article key={appointment.id} className="rounded-xl border border-white/[0.07] bg-surface-900/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-brand-500/20 bg-brand-900/30 px-2.5 py-2 text-center"><p className="text-sm font-bold text-brand-100">{appointment.startTime}</p><p className="mt-0.5 text-[10px] text-brand-400">até {appointment.endTime}</p></div>
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-100">{appointment.client.name}</p><p className="mt-0.5 truncate text-xs text-slate-400">{appointment.service.name} · {appointment.service.durationMin} min</p></div>
                    <StatusBadge status={appointment.status} />
                  </div>
                  {appointment.notes && <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-5 text-slate-500">{appointment.notes}</p>}
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3"><span className="flex items-center gap-1.5 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5 text-brand-400" />Cliente</span>{renderStatusControl(appointment)}</div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[780px] text-sm">
                <thead><tr className="border-y border-white/[0.06] bg-surface-900/45 text-left">
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Horário</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Cliente</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Serviço</th>
                  <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Etapa</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">Atualizar</th>
                </tr></thead>
                <tbody>{appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-white/[0.055] transition hover:bg-brand-900/[0.07]">
                    <td className="px-5 py-4"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-brand-400" /><div><p className="font-semibold text-slate-200">{appointment.startTime} — {appointment.endTime}</p><p className="mt-0.5 text-xs text-slate-600">{appointment.service.durationMin} min</p></div></div></td>
                    <td className="px-5 py-4"><p className="font-semibold text-slate-100">{appointment.client.name}</p>{appointment.notes && <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{appointment.notes}</p>}</td>
                    <td className="px-5 py-4"><span className="inline-flex rounded-lg border border-white/[0.07] bg-surface-800 px-2.5 py-1.5 text-xs font-medium text-slate-300">{appointment.service.name}</span></td>
                    <td className="px-5 py-4"><StatusBadge status={appointment.status} /></td>
                    <td className="px-5 py-4 text-right">{renderStatusControl(appointment)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo agendamento" size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-xl border border-brand-500/15 bg-brand-900/15 px-4 py-3 text-sm text-brand-100"><CheckCircle2 className="mr-2 inline h-4 w-4 text-brand-300" />O horário disponível é calculado automaticamente conforme o serviço escolhido.</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Cliente *</label><select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required><option value="">Selecione o cliente...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
            <div><label className="label">Serviço *</label><select className="input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} required><option value="">Selecione o serviço...</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMin} min</option>)}</select></div>
            <div><label className="label">Data *</label><input type="text" inputMode="numeric" className="input" placeholder="dd/mm/aaaa" value={form.dateBr} onChange={(e) => { const dateBr = maskBrDateInput(e.target.value); const date = brDateToIso(dateBr) ?? form.date; setForm({ ...form, dateBr, date }); }} required /></div>
            <div><label className="label">Horário disponível *</label><select className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required disabled={!form.serviceId}><option value="">{form.serviceId ? "Selecione o horário..." : "Escolha um serviço primeiro"}</option>{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></div>
            <div><label className="label">Status inicial</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></div>
          </div>
          <div><label className="label">Observações internas</label><textarea className="input resize-y" rows={3} placeholder="Orientações, preferências ou detalhes do atendimento..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button type="submit" className="btn-primary">Confirmar agendamento</button></div>
        </form>
      </Modal>
    </div>
  );
}
