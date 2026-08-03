"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarClock, CarFront, CheckCircle2, CircleDollarSign, Columns3, GripVertical, Loader2, MessageCircle, RefreshCw, Sparkles, UserPlus, Wrench } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";

type ColumnId = "new" | "quote" | "scheduled" | "in_progress" | "completed";

type PipelineCard = {
  id: string;
  entityType: "session" | "appointment";
  column: ColumnId;
  clientName: string;
  phone: string;
  vehicle?: string;
  service: string;
  value: number;
  updatedAt: string;
  date?: string;
  startTime?: string;
  stageLabel: string;
  status: string;
  href: string;
};

type PipelineData = {
  cards: PipelineCard[];
  counts: Record<ColumnId, number>;
  metrics: { activeOpportunities: number; openValue: number; inService: number; completedValue: number };
};

const columns: Array<{ id: ColumnId; label: string; detail: string; icon: LucideIcon; color: string }> = [
  { id: "new", label: "Novo contato", detail: "Leads em descoberta", icon: UserPlus, color: "text-sky-300 bg-sky-500/10 ring-sky-500/20" },
  { id: "quote", label: "Proposta", detail: "Orçamento em andamento", icon: CircleDollarSign, color: "text-violet-300 bg-violet-500/10 ring-violet-500/20" },
  { id: "scheduled", label: "Agendado", detail: "Reserva confirmada", icon: CalendarClock, color: "text-brand-300 bg-brand-500/10 ring-brand-500/20" },
  { id: "in_progress", label: "Em serviço", detail: "Veículo na operação", icon: Wrench, color: "text-amber-300 bg-amber-500/10 ring-amber-500/20" },
  { id: "completed", label: "Concluído", detail: "Pós-venda e recorrência", icon: CheckCircle2, color: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/20" },
];

const statusForColumn: Partial<Record<ColumnId, string>> = {
  scheduled: "CONFIRMED",
  in_progress: "IN_PROGRESS",
  completed: "COMPLETED",
};

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragged, setDragged] = useState<PipelineCard | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/pipeline", { cache: "no-store" });
      if (!response.ok) throw new Error("Os dados do pipeline estão temporariamente indisponíveis. Tente atualizar em instantes.");
      const payload = await response.json().catch(() => null);
      if (!payload) throw new Error("Os dados do pipeline estão temporariamente indisponíveis. Tente atualizar em instantes.");
      if (!payload.success) throw new Error(payload.error ?? "Falha ao carregar pipeline");
      setData(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar pipeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cardsByColumn = useMemo(() => {
    const result: Record<ColumnId, PipelineCard[]> = {
      new: [],
      quote: [],
      scheduled: [],
      in_progress: [],
      completed: [],
    };
    for (const card of data?.cards ?? []) result[card.column].push(card);
    return result;
  }, [data]);

  async function moveCard(card: PipelineCard, column: ColumnId) {
    const status = statusForColumn[column];
    if (card.entityType !== "appointment" || !status || card.column === column) return;

    setMoving(card.id);
    setError("");
    try {
      const response = await fetch(`/api/agendamentos/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.error ?? "Não foi possível mover o card");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível mover o card");
    } finally {
      setMoving(null);
      setDragged(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Pipeline CRM"
        eyebrow="Operação comercial em tempo real"
        icon={Columns3}
        description="Acompanhe cada contato do primeiro pedido à entrega, com contexto do WhatsApp, valor e evolução operacional."
        actions={
          <button type="button" onClick={() => void load()} className="btn-secondary" disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Oportunidades ativas", data?.metrics.activeOpportunities ?? 0, "Contatos em negociação", Sparkles],
          ["Valor em aberto", formatCurrency(data?.metrics.openValue ?? 0), "Potencial do pipeline", CircleDollarSign],
          ["Em execução", data?.metrics.inService ?? 0, "Veículos na operação", Wrench],
          ["Concluído em 30 dias", formatCurrency(data?.metrics.completedValue ?? 0), "Valor entregue", CheckCircle2],
        ].map(([label, value, detail, Icon]) => {
          const MetricIcon = Icon as LucideIcon;
          return (
            <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-surface-850/70 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{String(label)}</p><p className="mt-2 font-serif text-2xl font-bold text-brand-100">{String(value)}</p></div>
                <span className="rounded-xl bg-brand-900/35 p-2.5 text-brand-300 ring-1 ring-inset ring-brand-600/20"><MetricIcon className="h-4 w-4" /></span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{String(detail)}</p>
            </div>
          );
        })}
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300">{error}</div>}

      {loading && !data ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-white/[0.07] bg-surface-850/55"><Loader2 className="h-7 w-7 animate-spin text-brand-300" /></div>
      ) : (
        <section className="overflow-x-auto pb-3">
          <div className="grid min-w-[1420px] grid-cols-5 gap-4">
            {columns.map((column) => {
              const Icon = column.icon;
              const cards = cardsByColumn[column.id];
              return (
                <div
                  key={column.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dragged && void moveCard(dragged, column.id)}
                  className={cn("min-h-[560px] rounded-2xl border border-white/[0.07] bg-black/15 p-3 transition", dragged && statusForColumn[column.id] && "border-brand-500/25 bg-brand-950/20")}
                >
                  <div className="mb-3 flex items-center gap-3 px-1 py-1">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", column.color)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-200">{column.label}</h2><p className="mt-0.5 text-[11px] text-slate-600">{column.detail}</p></div>
                    <span className="rounded-full border border-white/[0.07] bg-surface-800 px-2 py-0.5 text-xs font-bold text-slate-400">{cards.length}</span>
                  </div>

                  <div className="space-y-2.5">
                    {cards.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-8 text-center text-xs text-slate-600">Nenhum card nesta etapa</div>
                    ) : cards.map((card) => (
                      <article
                        key={`${card.entityType}-${card.id}`}
                        draggable={card.entityType === "appointment"}
                        onDragStart={() => setDragged(card)}
                        onDragEnd={() => setDragged(null)}
                        className={cn("group rounded-xl border border-white/[0.075] bg-surface-850/95 p-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-brand-500/25", moving === card.id && "pointer-events-none opacity-50")}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-slate-100">{card.clientName}</h3><p className="mt-0.5 truncate text-[11px] text-slate-500">{formatPhone(card.phone)}</p></div>
                          {card.entityType === "appointment" && <GripVertical className="h-4 w-4 cursor-grab text-slate-700 group-hover:text-slate-500" />}
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs">
                          <p className="flex items-center gap-2 text-slate-300"><Wrench className="h-3.5 w-3.5 text-brand-400/70" /><span className="truncate">{card.service}</span></p>
                          {card.vehicle && <p className="flex items-center gap-2 text-slate-500"><CarFront className="h-3.5 w-3.5" /><span className="truncate">{card.vehicle}</span></p>}
                          {card.date && <p className="flex items-center gap-2 text-slate-500"><CalendarClock className="h-3.5 w-3.5" />{new Date(card.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })} às {card.startTime}</p>}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.055] pt-3">
                          <div><p className="text-[10px] uppercase tracking-wider text-slate-600">Potencial</p><p className="mt-0.5 text-sm font-semibold text-brand-200">{card.value > 0 ? formatCurrency(card.value) : "A avaliar"}</p></div>
                          <span className="max-w-[120px] truncate rounded-md bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-slate-500">{card.stageLabel}</span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-700">{relativeTime(card.updatedAt)}</span>
                          <Link href={card.href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-400 transition hover:text-brand-200">
                            {card.entityType === "session" ? <MessageCircle className="h-3.5 w-3.5" /> : null} Abrir <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-slate-600">Dica: arraste cards de agendamento entre “Agendado”, “Em serviço” e “Concluído”. Cada mudança atualiza o CRM e dispara a automação correspondente no WhatsApp.</p>
    </div>
  );
}
