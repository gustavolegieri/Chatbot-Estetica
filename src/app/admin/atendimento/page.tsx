"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  User,
  BarChart3,
  Pause,
  Play,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StatCard } from "@/components/ui/StatCard";
import { WhatsAppChatThread, type ChatMessage } from "@/components/atendimento/WhatsAppChatThread";
import { formatDate, formatPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ConversationItem {
  id: string;
  phone: string;
  clientName: string;
  handoffStatus: string;
  handoffAt: string | null;
  handoffReason: string | null;
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

const HANDOFF_BADGE: Record<string, string> = {
  PENDING: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-green-100 text-green-700",
  NONE: "",
};

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
  const [sending, setSending] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const loadDetail = useCallback(async (phone: string) => {
    const res = await fetch(`/api/atendimento/conversas/${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (data.success) {
      setDetail(data.data);
      setNote(data.data.session.handoffNote ?? "");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadConversations()]);
    if (selectedPhone) await loadDetail(selectedPhone);
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
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  async function selectConversation(phone: string) {
    setSelectedPhone(phone);
    setReply("");
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPhone || !reply.trim()) return;
    setSending(true);
    await fetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply.trim() }),
    });
    setReply("");
    setSending(false);
    await loadDetail(selectedPhone);
    await loadConversations();
  }

  async function sessionAction(action: string, extra?: object) {
    if (!selectedPhone) return;
    await fetch(`/api/atendimento/conversas/${encodeURIComponent(selectedPhone)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    await refreshAll();
  }

  const maxServiceCount = Math.max(...(overview?.topServices.map((s) => s.count) ?? [1]), 1);

  return (
    <div className="-m-8 flex h-[calc(100vh)] flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <AdminHeader
          title="Central de Atendimento"
          description="Conversas WhatsApp, solicitações ao dono e analytics do bot"
          actions={
            <button type="button" onClick={refreshAll} className="btn-secondary">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </button>
          }
        />

        {!loading && overview && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="Querem falar com dono"
              value={overview.totalHandoffs}
              icon={AlertCircle}
              trend={`${overview.pendingHandoffs} aguardando`}
            />
            <StatCard title="Msgs hoje" value={overview.messagesToday} icon={MessageCircle} />
            <StatCard title="Ativos (7 dias)" value={overview.activeSessionsWeek} icon={User} />
            <StatCard
              title="Agendamentos bot"
              value={overview.whatsappAppointmentsMonth}
              icon={CheckCircle2}
              trend="Este mês"
            />
            <StatCard
              title="Em atendimento"
              value={overview.inProgressHandoffs}
              icon={Phone}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAnalytics((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {showAnalytics ? "Ocultar analytics" : "Mostrar analytics"}
        </button>

        {showAnalytics && overview && (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Serviços mais agendados (WhatsApp)
              </h3>
              {overview.topServices.length === 0 ? (
                <p className="text-xs text-slate-500">Sem agendamentos via bot este mês</p>
              ) : (
                <div className="space-y-2">
                  {overview.topServices.map((s) => (
                    <div key={s.name}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{s.name}</span>
                        <span className="text-slate-500">{s.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${(s.count / maxServiceCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Funil do bot (7 dias)
              </h3>
              <div className="flex flex-wrap gap-2">
                {overview.funnel.slice(0, 10).map((f) => (
                  <span
                    key={f.stage}
                    className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
                  >
                    {f.label}: <strong>{f.count}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* Lista de conversas */}
        <div className="flex flex-col border-r border-slate-200 bg-white lg:col-span-3">
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input py-1.5 pl-8 text-sm"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadConversations()}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { id: "all", label: "Todas" },
                { id: "handoff", label: "🔴 Dono" },
                { id: "unread", label: "Não lidas" },
                { id: "active", label: "Ativas" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    filter === f.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <li className="p-6 text-center text-sm text-slate-500">
                Nenhuma conversa encontrada
              </li>
            ) : (
              conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(c.phone)}
                    className={cn(
                      "w-full border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50",
                      selectedPhone === c.phone && "bg-brand-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-slate-900">{c.clientName}</p>
                          {c.handoffStatus === "PENDING" && (
                            <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              DONO
                            </span>
                          )}
                          {c.unreadCount > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {c.lastMessagePreview ?? "Sem mensagens"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{c.flowStageLabel}</p>
                      </div>
                      {c.lastMessageAt && (
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatDate(c.lastMessageAt)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Chat */}
        <div className="flex min-h-0 flex-col bg-slate-50 lg:col-span-6">
          {!selectedPhone || !detail ? (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-500">
              <MessageCircle className="mb-3 h-12 w-12 text-slate-300" />
              <p>Selecione uma conversa para ver o histórico completo</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {detail.flow.customerName ?? detail.session.client?.name ?? "Cliente"}
                  </p>
                  <p className="text-xs text-slate-500">{formatPhone(detail.session.phone)}</p>
                </div>
                {detail.session.handoffStatus !== "NONE" && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      HANDOFF_BADGE[detail.session.handoffStatus]
                    )}
                  >
                    {detail.session.handoffStatus === "PENDING"
                      ? "Aguardando dono"
                      : detail.session.handoffStatus === "IN_PROGRESS"
                        ? "Em atendimento"
                        : "Resolvido"}
                  </span>
                )}
              </div>

              {detail.session.handoffReason && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  <strong>Solicitação:</strong> {detail.session.handoffReason}
                </div>
              )}

              <div className="min-h-0 flex-1 p-3">
                <WhatsAppChatThread
                  messages={detail.messages}
                  clientName={detail.flow.customerName ?? "Cliente"}
                />
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={sendReply} className="border-t border-slate-200 bg-white p-3">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Responder como admin (envia pelo WhatsApp)..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <button type="submit" disabled={sending || !reply.trim()} className="btn-primary">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Painel lateral */}
        <div className="overflow-y-auto border-l border-slate-200 bg-white p-4 lg:col-span-3">
          {!detail ? (
            <p className="text-sm text-slate-500">Detalhes do cliente aparecem aqui</p>
          ) : (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Fluxo atual</h3>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p>
                    <span className="text-slate-500">Etapa:</span> {detail.flow.stageLabel}
                  </p>
                  {detail.flow.serviceLabel && (
                    <p className="mt-1">
                      <span className="text-slate-500">Serviço:</span> {detail.flow.serviceLabel}
                    </p>
                  )}
                  {(detail.flow.vehicleRaw || detail.flow.vehicleModel) && (
                    <p className="mt-1">
                      <span className="text-slate-500">Veículo:</span>{" "}
                      {detail.flow.vehicleRaw ?? detail.flow.vehicleModel}
                    </p>
                  )}
                  {detail.flow.quoteMin != null && detail.flow.quoteMax != null && (
                    <p className="mt-1">
                      <span className="text-slate-500">Orçamento:</span> R$ {detail.flow.quoteMin} –{" "}
                      {detail.flow.quoteMax}
                    </p>
                  )}
                  {detail.flow.dayLabel && (
                    <p className="mt-1">
                      <span className="text-slate-500">Agendamento:</span> {detail.flow.dayLabel}
                      {detail.flow.startTime ? ` às ${detail.flow.startTime}` : ""}
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Ações</h3>
                <div className="flex flex-col gap-2">
                  {detail.session.handoffStatus === "PENDING" && (
                    <button
                      type="button"
                      onClick={() => sessionAction("assume")}
                      className="btn-primary w-full text-sm"
                    >
                      Assumir atendimento
                    </button>
                  )}
                  {detail.session.handoffStatus !== "NONE" &&
                    detail.session.handoffStatus !== "RESOLVED" && (
                      <button
                        type="button"
                        onClick={() => sessionAction("resolve", { note })}
                        className="btn-secondary w-full text-sm"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Marcar resolvido
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() =>
                      sessionAction("pause_bot", { paused: !detail.session.botPaused })
                    }
                    className="btn-secondary w-full text-sm"
                  >
                    {detail.session.botPaused ? (
                      <>
                        <Play className="mr-2 h-4 w-4" /> Reativar bot
                      </>
                    ) : (
                      <>
                        <Pause className="mr-2 h-4 w-4" /> Pausar bot
                      </>
                    )}
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Nota interna</h3>
                <textarea
                  className="input text-sm"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anotações sobre este atendimento..."
                />
                <button
                  type="button"
                  onClick={() => sessionAction("note", { note })}
                  className="btn-secondary mt-2 w-full text-sm"
                >
                  Salvar nota
                </button>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-800">
                  <Bot className="h-4 w-4" /> Agendamentos
                </h3>
                {detail.appointments.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum agendamento</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.appointments.map((a) => (
                      <li key={a.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                        <p className="font-medium">{a.service.name}</p>
                        <p className="text-slate-500">
                          {formatDate(a.date)} · {a.startTime} · {a.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
