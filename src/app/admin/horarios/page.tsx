"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

const DAYS = [
  { value: 0, label: "Domingo", short: "Dom" },
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terça-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
];

type DraftTimes = Record<string, Pick<BusinessHour, "openTime" | "closeTime">>;

export default function HorariosPage() {
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [drafts, setDrafts] = useState<DraftTimes>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchBusinessHours = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business-hours");
      const data = await res.json();
      const next = Array.isArray(data) ? data : [];
      setBusinessHours(next);
      setDrafts(
        Object.fromEntries(
          next.map((hour: BusinessHour) => [
            hour.id,
            { openTime: hour.openTime, closeTime: hour.closeTime },
          ]),
        ),
      );
    } catch {
      setMessage("Não foi possível carregar os horários de atendimento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBusinessHours();
  }, []);

  const hoursByDay = useMemo(
    () => new Map(businessHours.map((hour) => [hour.dayOfWeek, hour])),
    [businessHours],
  );
  const openDays = businessHours.filter((hour) => hour.isOpen).length;

  const update = async (id: string, body: Record<string, unknown>) => {
    setSavingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/business-hours/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("request_failed");
      await fetchBusinessHours();
      setMessage("Horário atualizado com sucesso.");
    } catch {
      setMessage("Não foi possível salvar a alteração. Tente novamente.");
    } finally {
      setSavingId(null);
    }
  };

  const handleCreate = async (dayOfWeek: number) => {
    const id = `new-${dayOfWeek}`;
    setSavingId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/business-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek,
          openTime: "08:00",
          closeTime: "18:00",
          isOpen: true,
        }),
      });
      if (!response.ok) throw new Error("request_failed");
      await fetchBusinessHours();
      setMessage("Rotina de atendimento criada.");
    } catch {
      setMessage("Não foi possível criar esse horário.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Horários de atendimento"
        description="Defina a janela oficial usada pela agenda e pelo assistente do WhatsApp."
        actions={
          <button onClick={() => void fetchBusinessHours()} disabled={loading} className="btn-secondary gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-700/40 bg-brand-950/30 px-4 py-3 text-sm text-brand-100 shadow-gold">
          <CheckCircle2 className="h-4 w-4 text-brand-300" />
          {message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/45 ring-1 ring-brand-700/40">
              <CalendarClock className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rotina ativa</p>
              <p className="mt-0.5 text-2xl font-semibold text-slate-100">{openDays} dias</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/35 ring-1 ring-emerald-700/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agendamento</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-200">Sincronizado com o bot</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 ring-1 ring-sky-700/40">
              <Clock3 className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Regra operacional</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-200">Fechado = sem horários no fluxo</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-surface-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-brand-100">Escala semanal</h2>
            <p className="mt-1 text-sm text-slate-400">As alterações passam a valer nos próximos horários oferecidos ao cliente.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-700/35 bg-brand-950/30 px-3 py-1 text-xs font-medium text-brand-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Operação em tempo real
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-brand-300" />
          </div>
        ) : (
          <div className="grid gap-px bg-surface-700 md:grid-cols-2 xl:grid-cols-3">
            {DAYS.map((day) => {
              const hour = hoursByDay.get(day.value);
              const draft = hour ? drafts[hour.id] : undefined;
              const isSaving = savingId === hour?.id || savingId === `new-${day.value}`;

              return (
                <article key={day.value} className="bg-surface-800 p-5 transition hover:bg-surface-750/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-700 text-sm font-bold text-brand-200">
                        {day.short}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">{day.label}</h3>
                        {hour ? (
                          <p className={`mt-1 text-xs font-medium ${hour.isOpen ? "text-emerald-400" : "text-slate-500"}`}>
                            {hour.isOpen ? "Disponível para novos horários" : "Sem novos horários"}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">Sem regra cadastrada</p>
                        )}
                      </div>
                    </div>
                    {hour && (
                      <button
                        type="button"
                        onClick={() => void update(hour.id, { isOpen: !hour.isOpen })}
                        disabled={isSaving}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                          hour.isOpen
                            ? "border-emerald-700/50 bg-emerald-950/35 text-emerald-300 hover:bg-emerald-900/50"
                            : "border-surface-600 bg-surface-850 text-slate-400 hover:border-brand-700/50"
                        }`}
                      >
                        {hour.isOpen ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {hour.isOpen ? "Aberto" : "Fechado"}
                      </button>
                    )}
                  </div>

                  {hour ? (
                    <>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <label>
                          <span className="mb-1.5 block text-xs font-medium text-slate-400">Abertura</span>
                          <input
                            type="time"
                            value={draft?.openTime ?? hour.openTime}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [hour.id]: { openTime: event.target.value, closeTime: current[hour.id]?.closeTime ?? hour.closeTime },
                              }))
                            }
                            className="input py-2"
                            disabled={isSaving}
                          />
                        </label>
                        <label>
                          <span className="mb-1.5 block text-xs font-medium text-slate-400">Fechamento</span>
                          <input
                            type="time"
                            value={draft?.closeTime ?? hour.closeTime}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [hour.id]: { openTime: current[hour.id]?.openTime ?? hour.openTime, closeTime: event.target.value },
                              }))
                            }
                            className="input py-2"
                            disabled={isSaving}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          void update(hour.id, {
                            openTime: draft?.openTime ?? hour.openTime,
                            closeTime: draft?.closeTime ?? hour.closeTime,
                          })
                        }
                        className="btn-secondary mt-4 w-full gap-2 py-2"
                      >
                        {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                        Salvar horário
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleCreate(day.value)}
                      disabled={isSaving}
                      className="btn-secondary mt-5 w-full gap-2 py-2"
                    >
                      {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Criar rotina
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
