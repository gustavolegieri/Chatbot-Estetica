"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowUpRight,
  CarFront,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Headphones,
  MessageCircle,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { WhatsAppChatThread, type ChatMessage } from "@/components/atendimento/WhatsAppChatThread";
import { cn, formatCurrency, formatDate, formatPhone } from "@/lib/utils";

interface ConversationItem {
  id: string;
  phone: string;
  clientName: string;
  handoffStatus: string;
  handoffAt: string | null;
  handoffReason: string | null;
  botPaused: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  flowStageLabel: string;
  serviceLabel?: string;
  vehicleRaw?: string;
}

interface Overview {
  pendingHandoffs: number;
  inProgressHandoffs: number;
  totalHandoffs: number;
  messagesToday: number;
  activeSessionsWeek: number;
  whatsappAppointmentsMonth: number;
  topServices: Array<{ name: string; count: number }>;
  funnel: Array<{ stage: string; label: string; count: number }>;
}

interface ConversationDetail {
  session: {
    id: string;
    phone: string;
    handoffStatus: string;
    handoffAt: string | null;
    handoffReason: string | null;
    handoffNote: string | null;
    botPaused: boolean;
    client: { id: string; name: string; phone: string; vehicleModel: string | null } | null;
  };
  flow: {
    stageLabel: string;
    customerName?: string;
    serviceLabel?: string;
    vehicleRaw?: string;
    vehicleModel?: string;
    dayLabel?: string;
    startTime?: string;
    quoteMin?: number;
    quoteMax?: number;
  };
  messages: ChatMessage[];
  appointments: Array<{
    id: string;
    date: string;
    startTime: string;
    status: string;
    service: { name: string };
  }>;
}

const HANDOFF_META: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: "Aguardando equipe",
    className: "border-red-500/25 bg-red-500/10 text-red-300",
  },
  IN_PROGRESS: {
    label: "Atendimento humano",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  },
  RESOLVED: {
    label: "Concluído",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  },
};

function conversationInitial(name: string) {
  return (name.trim().charAt(0) || "C").toUpperCase();
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "gold",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: "gold" | "red" | "blue" | "green" | "violet";
}) {
  const tones = {
    gold: "bg-brand-900/35 text-brand-300 ring-brand-600/25",
    red: "bg-red-500/10 text-red-300 ring-red-500/20",
    blue: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
    green: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-300 ring-violet-500/20",
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-surface-850/70 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 font-serif text-2xl font-bold text-slate-100">{value}</p>
        </div>
        <div className={cn("rounded-xl p-2.5 ring-1 ring-inset", tones[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</h3>;
}

export default function AtendimentoPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const phone = new URLSearchParams(window.location.search).get("phone");
    if (phone) setSelectedPhone(phone);
  }, []);

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/atendimento/overview");
    const data = await res.json();
    if (data.success) setOverview(data.data);
  }, []);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ filter });
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/atendimento/conversas?${params}`);
    const data = await res.json();
    if (data.success) setConversations(data.data);
  }, [filter, search]);

  const loadDetail = useCallback(async (phone: string, showLoader = true) => {
    if (showLoader) setDetailLoading(true);
    try {
      const res = await fetch(`/api/atendimento/conversas/${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) {
        setDetail(data.data);
        setNote(data.data.session.handoffNote ?? "");
      }
    } finally {
      if (showLoader) setDetailLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadConversations()]);
    if (selectedPhone) await loadDetail(selectedPhone, false);
  }, [loadOverview, loadConversations, loadDetail, selectedPhone]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOverview(), loadConversations()]).finally(() => setLoading(false));
  }, [loadOverview, loadConversations]);

  useEffect(() => {
    if (!selectedPhone) return;
    loadDetail(selectedPhone);
  }, [selectedPhone, loadDetail]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  useEffect(() => {
    const interval = setInterval(refreshAll, 15_000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  async function handleRefresh() {
    setRefreshing(true);
    setFeedback(null);
    try {
      await refreshAll();
    } catch {
      setFeedback("Não foi possível atualizar a central agora.");
    } finally {
      setRefreshing(false);
    }
  }

  function selectConversation(phone: string) {
    if (phone !== selectedPhone) setDetail(null);
    setSelectedPhone(phone);
    setReply("");
    setFeedback(null);
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPhone || !reply.trim()) return;

    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Falha ao enviar mensagem");
      setReply("");
      await Promise.all([loadDetail(selectedPhone, false), loadConversations()]);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function sessionAction(action: string, extra?: object) {
    if (!selectedPhone) return;
    setActionPending(action);
    setFeedback(null);
    try {
      const res = await fetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Não foi possível atualizar o atendimento");
      await refreshAll();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o atendimento.");
    } finally {
      setActionPending(null);
    }
  }

  const maxServiceCount = Math.max(...(overview?.topServices.map((service) => service.count) ?? [1]), 1);
  const activeHandoff = detail ? HANDOFF_META[detail.session.handoffStatus] : undefined;
  const selectedClientName = detail?.flow.customerName ?? detail?.session.client?.name ?? "Cliente";

  return (
    <div className="mx-auto max-w-[1800px] space-y-5">
      <AdminHeader
        title="Central de Atendimento"
        eyebrow="CRM · WhatsApp e IA Cerebras"
        icon={Headphones}
        description="Acompanhe cada conversa, assuma solicitações prioritárias e mantenha o bot alinhado com a equipe."
        actions={
          <button type="button" onClick={handleRefresh} className="btn-secondary" disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Atualizar central
          </button>
        }
      />

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {feedback}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          label="Prioridade"
          value={loading ? "—" : overview?.pendingHandoffs ?? 0}
          detail="Aguardando atendimento humano"
          icon={AlertCircle}
          tone="red"
        />
        <MetricCard
          label="Em atendimento"
          value={loading ? "—" : overview?.inProgressHandoffs ?? 0}
          detail="Conversas já assumidas pela equipe"
          icon={Headphones}
          tone="gold"
        />
        <MetricCard
          label="Mensagens hoje"
          value={loading ? "—" : overview?.messagesToday ?? 0}
          detail="Movimentação em todos os atendimentos"
          icon={MessageCircle}
          tone="blue"
        />
        <MetricCard
          label="Clientes ativos"
          value={loading ? "—" : overview?.activeSessionsWeek ?? 0}
          detail="Conversas nos últimos sete dias"
          icon={UserRound}
          tone="violet"
        />
        <MetricCard
          label="Agendamentos bot"
          value={loading ? "—" : overview?.whatsappAppointmentsMonth ?? 0}
          detail="Confirmados via WhatsApp neste mês"
          icon={CheckCircle2}
          tone="green"
        />
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-surface-850/70 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setShowAnalytics((show) => !show)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showAnalytics}
        >
          <span>
            <span className="text-sm font-semibold text-slate-200">Leitura rápida do funil</span>
            <span className="ml-2 text-xs text-slate-500">serviços e etapas acompanhados pelo WhatsApp</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-300">
            {showAnalytics ? "Ocultar" : "Ver indicadores"}
            <ArrowUpRight className={cn("h-3.5 w-3.5 transition-transform", showAnalytics && "rotate-90")} />
          </span>
        </button>

        {showAnalytics && overview && (
          <div className="mt-4 grid gap-4 border-t border-white/[0.06] pt-4 lg:grid-cols-2">
            <div className="rounded-xl bg-black/15 p-4 ring-1 ring-inset ring-white/[0.05]">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Serviços mais solicitados</SectionTitle>
                <span className="text-xs text-slate-500">este mês</span>
              </div>
              {overview.topServices.length === 0 ? (
                <p className="text-sm text-slate-500">Ainda não há agendamentos por WhatsApp neste período.</p>
              ) : (
                <div className="space-y-3">
                  {overview.topServices.map((service) => (
                    <div key={service.name}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-300">{service.name}</span>
                        <span className="font-semibold text-brand-300">{service.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-700">
                        <div
                          className="h-full rounded-full bg-gold-gradient"
                          style={{ width: `${(service.count / maxServiceCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-black/15 p-4 ring-1 ring-inset ring-white/[0.05]">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Etapas do fluxo</SectionTitle>
                <span className="text-xs text-slate-500">últimos 7 dias</span>
              </div>
              {overview.funnel.length === 0 ? (
                <p className="text-sm text-slate-500">Sem etapas registradas no período.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {overview.funnel.slice(0, 10).map((stage) => (
                    <span
                      key={stage.stage}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-700/25 bg-brand-900/20 px-2.5 py-1 text-xs text-brand-100"
                    >
                      {stage.label}
                      <strong className="text-brand-300">{stage.count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="grid min-h-[730px] overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-850 shadow-[0_24px_70px_rgba(0,0,0,0.23)] lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-[360px] min-w-0 flex-col border-b border-white/[0.07] bg-[#111112] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/[0.07] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Fila de conversas</p>
                <p className="mt-0.5 text-xs text-slate-500">Priorize quem precisa da equipe</p>
              </div>
              <span className="rounded-full border border-brand-600/25 bg-brand-900/25 px-2 py-1 text-xs font-bold text-brand-200">
                {conversations.length}
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                className="input bg-black/20 py-2 pl-9 text-sm"
                placeholder="Buscar cliente ou número"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && loadConversations()}
              />
            </div>
            <div className="crm-filter-scrollbar mt-3 flex gap-1 overflow-x-auto pb-0.5">
              {[
                { id: "all", label: "Todas" },
                { id: "handoff", label: "Prioridade" },
                { id: "unread", label: "Não lidas" },
                { id: "active", label: "Ativas" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                    filter === item.id
                      ? "bg-brand-500 text-surface-950 shadow-[0_5px_16px_rgba(212,175,55,0.2)]"
                      : "bg-white/[0.045] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <li key={index} className="mx-3 my-2 animate-pulse rounded-xl bg-white/[0.04] p-3">
                  <div className="h-3 w-2/3 rounded bg-white/[0.08]" />
                  <div className="mt-2 h-2.5 w-full rounded bg-white/[0.06]" />
                </li>
              ))
            ) : conversations.length === 0 ? (
              <li className="px-6 py-12 text-center">
                <MessageCircle className="mx-auto h-8 w-8 text-slate-700" />
                <p className="mt-3 text-sm font-medium text-slate-400">Nenhuma conversa encontrada</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Ajuste os filtros ou aguarde novas mensagens.</p>
              </li>
            ) : (
              conversations.map((conversation) => {
                const active = selectedPhone === conversation.phone;
                const priority = conversation.handoffStatus === "PENDING";

                return (
                  <li key={conversation.id} className="px-2 py-0.5">
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.phone)}
                      className={cn(
                        "group relative flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all",
                        active
                          ? "bg-brand-900/25 ring-1 ring-inset ring-brand-500/25"
                          : "hover:bg-white/[0.045]"
                      )}
                    >
                      {active && <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-brand-300" />}
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ring-1 ring-inset",
                          priority
                            ? "bg-red-500/10 text-red-200 ring-red-500/20"
                            : "bg-surface-700 text-brand-200 ring-brand-700/30"
                        )}
                      >
                        {conversationInitial(conversation.clientName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{conversation.clientName}</p>
                          {conversation.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-surface-950">
                              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">{conversation.lastMessagePreview ?? "Sem mensagens registradas"}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className={cn("truncate text-[10px] font-semibold", priority ? "text-red-300" : "text-slate-600")}>
                            {priority ? "SOLICITOU EQUIPE" : conversation.flowStageLabel}
                          </span>
                          {conversation.lastMessageAt && (
                            <span className="shrink-0 text-[10px] text-slate-600">{formatDate(conversation.lastMessageAt)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        <div className="flex min-h-[560px] min-w-0 flex-col bg-[#171717]">
          {!selectedPhone || !detail ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              {detailLoading ? (
                <RefreshCw className="h-8 w-8 animate-spin text-brand-400" />
              ) : (
                <div className="rounded-2xl border border-brand-700/20 bg-brand-900/15 p-5">
                  <MessageCircle className="h-10 w-10 text-brand-300" />
                </div>
              )}
              <p className="mt-5 text-base font-semibold text-slate-300">
                {detailLoading ? "Carregando conversa" : "Selecione uma conversa"}
              </p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Veja o histórico, o contexto do fluxo e assuma o atendimento quando necessário.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#131313] px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/35 text-sm font-bold text-brand-200 ring-1 ring-brand-600/20">
                    {conversationInitial(selectedClientName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-100">{selectedClientName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <Phone className="h-3 w-3" />
                      {formatPhone(detail.session.phone)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      detail.session.botPaused
                        ? "border-slate-600/60 bg-slate-700/50 text-slate-300"
                        : "border-violet-500/25 bg-violet-500/10 text-violet-200"
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {detail.session.botPaused ? "IA Cerebras pausada" : "IA Cerebras no fluxo"}
                  </span>
                  {activeHandoff && (
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", activeHandoff.className)}>
                      {activeHandoff.label}
                    </span>
                  )}
                </div>
              </div>

              {detail.session.handoffReason && detail.session.handoffStatus !== "RESOLVED" && (
                <div className="flex items-start gap-2 border-b border-amber-500/15 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-100 sm:px-5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>
                    <strong className="font-semibold">Motivo da transferência:</strong> {detail.session.handoffReason}
                  </span>
                </div>
              )}

              <div className="min-h-0 flex-1 p-3 sm:p-4">
                <WhatsAppChatThread
                  messages={detail.messages}
                  clientName={selectedClientName}
                  className="h-full min-h-[360px]"
                />
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendReply} className="border-t border-white/[0.07] bg-[#131313] p-3 sm:p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <CircleAlert className="h-3.5 w-3.5 text-brand-400" />
                  Resposta humana enviada pelo WhatsApp
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    className="input min-h-[44px] flex-1 resize-none bg-black/20 py-2.5"
                    placeholder="Escreva uma resposta para o cliente..."
                    rows={1}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="btn-primary h-11 w-11 shrink-0 px-0"
                    aria-label="Enviar resposta"
                  >
                    <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <aside className="min-w-0 border-t border-white/[0.07] bg-[#111112] p-4 lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0 sm:p-5">
          {!detail ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
              <UserRound className="h-8 w-8 text-slate-700" />
              <p className="mt-3 text-sm font-medium text-slate-500">Perfil do cliente</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">Os dados do veículo, serviço e histórico aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-brand-700/20 bg-gradient-to-br from-brand-900/25 to-transparent p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-surface-950 shadow-[0_6px_18px_rgba(212,175,55,0.2)]">
                    {conversationInitial(selectedClientName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-100">{selectedClientName}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <Phone className="h-3.5 w-3.5 text-brand-400" />
                      {formatPhone(detail.session.phone)}
                    </p>
                  </div>
                </div>
                {detail.session.client?.vehicleModel && (
                  <div className="mt-3 flex items-center gap-2 border-t border-brand-600/15 pt-3 text-xs text-slate-400">
                    <CarFront className="h-3.5 w-3.5 text-brand-400" />
                    {detail.session.client.vehicleModel}
                  </div>
                )}
              </section>

              <section>
                <SectionTitle>Contexto do fluxo</SectionTitle>
                <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.06] bg-black/15 p-3.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Etapa atual</span>
                    <span className="max-w-[62%] text-right font-medium text-slate-200">{detail.flow.stageLabel}</span>
                  </div>
                  {detail.flow.serviceLabel && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Serviço</span>
                      <span className="max-w-[62%] text-right font-medium text-brand-200">{detail.flow.serviceLabel}</span>
                    </div>
                  )}
                  {(detail.flow.vehicleRaw || detail.flow.vehicleModel) && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Veículo</span>
                      <span className="max-w-[62%] text-right font-medium text-slate-200">
                        {detail.flow.vehicleRaw ?? detail.flow.vehicleModel}
                      </span>
                    </div>
                  )}
                  {detail.flow.quoteMin != null && detail.flow.quoteMax != null && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Estimativa</span>
                      <span className="max-w-[62%] text-right font-medium text-emerald-300">
                        {formatCurrency(detail.flow.quoteMin)} – {formatCurrency(detail.flow.quoteMax)}
                      </span>
                    </div>
                  )}
                  {detail.flow.dayLabel && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500">Agendamento</span>
                      <span className="max-w-[62%] text-right font-medium text-slate-200">
                        {detail.flow.dayLabel}
                        {detail.flow.startTime ? ` · ${detail.flow.startTime}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <SectionTitle>Controle de atendimento</SectionTitle>
                <div className="mt-3 space-y-2">
                  {detail.session.handoffStatus === "PENDING" && (
                    <button
                      type="button"
                      onClick={() => sessionAction("assume")}
                      className="btn-primary w-full"
                      disabled={actionPending !== null}
                    >
                      <Headphones className="mr-2 h-4 w-4" />
                      {actionPending === "assume" ? "Assumindo..." : "Assumir atendimento"}
                    </button>
                  )}
                  {detail.session.handoffStatus !== "NONE" && detail.session.handoffStatus !== "RESOLVED" && (
                    <button
                      type="button"
                      onClick={() => sessionAction("resolve", { note })}
                      className="btn-secondary w-full"
                      disabled={actionPending !== null}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {actionPending === "resolve" ? "Concluindo..." : "Concluir e reativar bot"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sessionAction("pause_bot", { paused: !detail.session.botPaused })}
                    className="btn-secondary w-full"
                    disabled={actionPending !== null}
                  >
                    {detail.session.botPaused ? (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Reativar IA Cerebras
                      </>
                    ) : (
                      <>
                        <Pause className="mr-2 h-4 w-4" />
                        Pausar IA Cerebras
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {detail.session.botPaused
                    ? "A conversa está sob controle manual da equipe."
                    : "A IA continua o fluxo até uma transferência ou pausa manual."}
                </p>
              </section>

              <section>
                <SectionTitle>Nota interna</SectionTitle>
                <textarea
                  className="input mt-3 min-h-24 resize-y bg-black/15 text-sm"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Registre contexto para a próxima pessoa da equipe..."
                />
                <button
                  type="button"
                  onClick={() => sessionAction("note", { note })}
                  className="btn-secondary mt-2 w-full text-sm"
                  disabled={actionPending !== null}
                >
                  {actionPending === "note" ? "Salvando..." : "Salvar nota"}
                </button>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <SectionTitle>Agendamentos</SectionTitle>
                  <Clock3 className="h-4 w-4 text-brand-500" />
                </div>
                {detail.appointments.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-slate-600">
                    Nenhum agendamento associado ainda.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {detail.appointments.map((appointment) => (
                      <li key={appointment.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-3 text-xs">
                        <p className="font-semibold text-slate-200">{appointment.service.name}</p>
                        <p className="mt-1 text-slate-500">
                          {formatDate(appointment.date)} · {appointment.startTime}
                        </p>
                        <p className="mt-1 font-medium text-brand-300">{appointment.status}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
