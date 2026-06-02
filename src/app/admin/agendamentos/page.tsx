"use client";

import { useEffect, useState } from "react";
import { Plus, Calendar } from "lucide-react";
import { format } from "date-fns";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";

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

export default function AgendamentosPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [form, setForm] = useState({
    clientId: "",
    serviceId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "",
    status: "CONFIRMED",
    notes: "",
  });

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, [filterDate]);

  useEffect(() => {
    if (form.serviceId && form.date) {
      fetch(`/api/agendamentos/slots?date=${form.date}&serviceId=${form.serviceId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setSlots(res.data);
        });
    }
  }, [form.serviceId, form.date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error ?? "Erro ao agendar");
      return;
    }
    setModalOpen(false);
    load();
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
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Agendamentos"
        description="Gerencie a agenda de serviços"
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo agendamento
          </button>
        }
      />

      <div className="mb-4">
        <label className="label">Filtrar por data</label>
        <input
          type="date"
          className="input max-w-xs"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : appointments.length === 0 ? (
          <EmptyState icon={Calendar} title="Nenhum agendamento nesta data" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Horário</th>
                <th className="pb-3 font-medium">Cliente</th>
                <th className="pb-3 font-medium">Serviço</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => (
                <tr key={apt.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium">
                    {apt.startTime} - {apt.endTime}
                  </td>
                  <td className="py-3">{apt.client.name}</td>
                  <td className="py-3">
                    {apt.service.name}
                    <span className="ml-1 text-xs text-slate-400">({apt.service.durationMin} min)</span>
                  </td>
                  <td className="py-3">
                    <StatusBadge status={apt.status} />
                  </td>
                  <td className="py-3">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={apt.status}
                      onChange={(e) => updateStatus(apt.id, e.target.value)}
                    >
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo agendamento" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Cliente *</label>
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Serviço *</label>
            <select className="input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} required>
              <option value="">Selecione...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Data *</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div>
            <label className="label">Horário *</label>
            <select className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required>
              <option value="">Selecione...</option>
              {slots.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Agendar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
