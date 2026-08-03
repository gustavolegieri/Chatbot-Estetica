"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CalendarClock, CarFront, CheckCircle2, CircleDollarSign, Cloud, Columns3, Copy, Download, ExternalLink, GripVertical, Loader2, MessageCircle, QrCode, RefreshCw, Send, Sparkles, Target, UserPlus, Wrench, X } from "lucide-react";
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
  unreadCount?: number;
  lastMessagePreview?: string;
  source?: string;
  marketingConsent?: boolean;
  leadCity?: string;
  href: string;
};

type PipelineData = {
  cards: PipelineCard[];
  counts: Record<ColumnId, number>;
  metrics: { weeklyLeads: number; weeklyTarget: number; weeklyProgress: number; activeOpportunities: number; openValue: number; inService: number; completedValue: number };
  sourceBreakdown: Array<{ source: string; count: number }>;
  shareLinks: Array<{ source: string; label: string; url: string }>;
  integrations: { hubspot: { configured: boolean; portalId: string } };
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
  const [messageCard, setMessageCard] = useState<PipelineCard | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSuccess, setMessageSuccess] = useState("");
  const [copiedSource, setCopiedSource] = useState("");

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
    if (card.entityType === "session" && (column === "new" || column === "quote") && card.column !== column) {
      setMoving(card.id);
      setError("");
      try {
        const response = await fetch("/api/pipeline", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: card.id, column }),
        });
        const payload = await response.json();
        if (!payload.success) throw new Error(payload.error ?? "Não foi possível mover o lead");
        await load();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível mover o lead");
      } finally {
        setMoving(null);
        setDragged(null);
      }
      return;
    }

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

  function openMessage(card: PipelineCard) {
    setMessageCard(card);
    setMessageSuccess("");
    setError("");
    setMessageText(`Olá, ${card.clientName}. Tudo bem? Podemos ajudar a continuar seu atendimento sobre ${card.service.toLowerCase()}?`);
  }

  async function sendPipelineMessage() {
    if (!messageCard || messageText.trim().length < 2) return;
    setSendingMessage(true);
    setError("");
    setMessageSuccess("");
    try {
      const response = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: messageCard.phone, text: messageText.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error ?? "Não foi possível enviar a mensagem");
      setMessageSuccess("Mensagem aceita pela WASender e registrada no histórico.");
      setMessageText("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a mensagem");
    } finally {
      setSendingMessage(false);
    }
  }

  async function copyCaptureLink(source: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedSource(source);
    window.setTimeout(() => setCopiedSource(""), 1800);
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
          ["Meta semanal", `${data?.metrics.weeklyLeads ?? 0}/${data?.metrics.weeklyTarget ?? 10}`, "Leads autorizados em 7 dias", Target],
          ["Oportunidades ativas", data?.metrics.activeOpportunities ?? 0, "Contatos em negociação", Sparkles],
          ["Valor em aberto", formatCurrency(data?.metrics.openValue ?? 0), "Potencial do pipeline", CircleDollarSign],
          ["Em execução", data?.metrics.inService ?? 0, "Veículos na operação", Wrench],
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

      <section className="grid gap-4 xl:grid-cols-[1.05fr_1.95fr]">
        <div className="rounded-2xl border border-brand-500/15 bg-gradient-to-br from-brand-950/75 to-surface-850 p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-400">Captação automática</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Meta: 10 leads por semana</h2></div><span className="rounded-xl bg-brand-500/10 p-3 text-brand-300 ring-1 ring-inset ring-brand-500/20"><Target className="h-5 w-5" /></span></div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-black/35"><div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${data?.metrics.weeklyProgress ?? 0}%` }} /></div>
          <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">{data?.metrics.weeklyLeads ?? 0} captados nos últimos 7 dias</span><span className="font-bold text-brand-300">{data?.metrics.weeklyProgress ?? 0}%</span></div>
          <div className="mt-4 flex flex-wrap gap-2">{(data?.sourceBreakdown ?? []).length > 0 ? data?.sourceBreakdown.map((item) => <span key={item.source} className="rounded-full border border-white/[0.07] bg-black/20 px-2.5 py-1 text-[10px] text-slate-400">{item.source}: <strong className="text-slate-200">{item.count}</strong></span>) : <p className="text-xs leading-5 text-slate-600">Divulgue os links ao lado. O primeiro cadastro aparecerá aqui com a origem correta.</p>}</div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-surface-850/70 p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Canais rastreáveis</p><h2 className="mt-1 text-base font-semibold text-slate-100">Links e QR Codes para divulgação</h2></div><QrCode className="h-5 w-5 text-brand-400" /></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{(data?.shareLinks ?? []).map((link) => <div key={link.source} className="flex items-center gap-2 rounded-xl border border-white/[0.065] bg-black/15 p-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">{link.label}</p><p className="mt-0.5 truncate text-[10px] text-slate-600">{link.url}</p></div><a href={link.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-brand-300" title="Abrir página"><ExternalLink className="h-3.5 w-3.5" /></a><button type="button" onClick={() => void copyCaptureLink(link.source, link.url)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-brand-300" title="Copiar link">{copiedSource === link.source ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}</button><a href={`/api/leads/qr?source=${encodeURIComponent(link.source)}`} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-brand-300" title="Baixar QR Code"><Download className="h-3.5 w-3.5" /></a></div>)}</div>
        </div>
      </section>

      <a
        href={`https://app.hubspot.com/forms/${data?.integrations.hubspot.portalId ?? "51824457"}`}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex items-center justify-between gap-4 rounded-2xl border px-5 py-4 transition hover:bg-white/[0.035]",
          data?.integrations.hubspot.configured
            ? "border-emerald-500/20 bg-emerald-500/[0.055]"
            : "border-amber-500/20 bg-amber-500/[0.055]"
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn("rounded-xl p-2.5", data?.integrations.hubspot.configured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300")}><Cloud className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-sm text-slate-100">{data?.integrations.hubspot.configured ? "HubSpot conectado" : "HubSpot aguardando formulário publicado"}</strong><span className="mt-1 block text-xs text-slate-500">Os contatos ficam seguros neste CRM e são sincronizados com o portal 51824457 quando a conexão está ativa.</span></span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-brand-300">Abrir HubSpot <ExternalLink className="h-3.5 w-3.5" /></span>
      </a>

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
                  className={cn("min-h-[560px] rounded-2xl border border-white/[0.07] bg-black/15 p-3 transition", dragged && (statusForColumn[column.id] || (dragged.entityType === "session" && (column.id === "new" || column.id === "quote"))) && "border-brand-500/25 bg-brand-950/20")}
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
                        draggable={card.entityType === "appointment" || card.entityType === "session"}
                        onDragStart={() => setDragged(card)}
                        onDragEnd={() => setDragged(null)}
                        className={cn("group rounded-xl border border-white/[0.075] bg-surface-850/95 p-3.5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:border-brand-500/25", moving === card.id && "pointer-events-none opacity-50")}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-slate-100">{card.clientName}</h3><p className="mt-0.5 truncate text-[11px] text-slate-500">{formatPhone(card.phone)}</p></div>
                          <div className="flex items-center gap-1.5">
                            {(card.unreadCount ?? 0) > 0 && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">{card.unreadCount}</span>}
                            <GripVertical className="h-4 w-4 cursor-grab text-slate-700 group-hover:text-slate-500" />
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs">
                          <p className="flex items-center gap-2 text-slate-300"><Wrench className="h-3.5 w-3.5 text-brand-400/70" /><span className="truncate">{card.service}</span></p>
                          {card.vehicle && <p className="flex items-center gap-2 text-slate-500"><CarFront className="h-3.5 w-3.5" /><span className="truncate">{card.vehicle}</span></p>}
                          {card.date && <p className="flex items-center gap-2 text-slate-500"><CalendarClock className="h-3.5 w-3.5" />{new Date(card.date).toLocaleDateString("pt-BR", { timeZone: "UTC" })} às {card.startTime}</p>}
                          {card.marketingConsent && <p className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-1 text-[10px] font-semibold text-emerald-300">Contato autorizado · {card.leadCity ?? "WhatsApp"}</p>}
                          {card.lastMessagePreview && <p className="line-clamp-2 rounded-lg bg-black/15 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">“{card.lastMessagePreview}”</p>}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.055] pt-3">
                          <div><p className="text-[10px] uppercase tracking-wider text-slate-600">Potencial</p><p className="mt-0.5 text-sm font-semibold text-brand-200">{card.value > 0 ? formatCurrency(card.value) : "A avaliar"}</p></div>
                          <span className="max-w-[120px] truncate rounded-md bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-slate-500">{card.stageLabel}</span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-700">{relativeTime(card.updatedAt)}</span>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => openMessage(card)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 transition hover:text-emerald-200"><Send className="h-3.5 w-3.5" /> Mensagem</button>
                            <Link href={card.href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-400 transition hover:text-brand-200">
                              {card.entityType === "session" ? <MessageCircle className="h-3.5 w-3.5" /> : null} Abrir <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
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

      <p className="text-xs text-slate-600">Dica: contatos recebidos no WhatsApp entram automaticamente como leads. Arraste leads entre “Novo contato” e “Proposta”, mova agendamentos pela operação e use “Mensagem” para falar com o cliente sem sair do CRM.</p>

      {messageCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Enviar mensagem ao lead">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-surface-900 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-400">Contato pelo CRM</p><h2 className="mt-1 font-serif text-xl font-bold text-brand-100">{messageCard.clientName}</h2><p className="mt-1 text-xs text-slate-500">{formatPhone(messageCard.phone)} · mensagem individual pela WASender</p></div>
              <button type="button" onClick={() => setMessageCard(null)} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <textarea className="input mt-5 min-h-36 resize-y" maxLength={1200} value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Escreva uma mensagem profissional e personalizada..." />
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600"><span>O envio só acontece ao clicar no botão abaixo.</span><span>{messageText.length}/1200</span></div>
            {messageSuccess && <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-sm text-emerald-300">{messageSuccess}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setMessageCard(null)} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={() => void sendPipelineMessage()} disabled={sendingMessage || messageText.trim().length < 2} className="btn-primary"><Send className="mr-2 h-4 w-4" />{sendingMessage ? "Enviando..." : "Enviar pelo WhatsApp"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
