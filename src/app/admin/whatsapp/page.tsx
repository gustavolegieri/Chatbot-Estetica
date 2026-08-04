"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  Headphones,
  MessageCircleMore,
  Mic2,
  Radio,
  RefreshCw,
  Send,
  ServerCog,
  Sparkles,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { cn } from "@/lib/utils";

type Tab = "overview" | "delivery" | "intelligence";
type Status = "healthy" | "warning" | "critical";

interface HealthData {
  status: Status;
  whatsappEnabled: boolean;
  testMode: { enabled: boolean; phone: string | null };
  integrations: { wasender: boolean; cerebras: boolean; groq: boolean; voice: boolean };
  queue: {
    pending: number;
    retrying: number;
    dailyLimit: number;
    errors24h: number;
    oldestPendingAt: string | null;
  };
  processing: {
    activeLocks: number;
    staleLocks: number;
    dedupProtected: number;
    pendingHandoffs: number;
  };
  traffic: {
    inboundHour: number;
    outboundHour: number;
    inboundDay: number;
    outboundDay: number;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
  };
}

const statusTheme = {
  healthy: {
    label: "Operação saudável",
    description: "Mensagens, IA e entregas estão operando normalmente.",
    icon: CheckCircle2,
    className: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200",
    glow: "bg-emerald-400",
  },
  warning: {
    label: "Atenção recomendada",
    description: "O atendimento funciona, mas há itens que merecem revisão.",
    icon: AlertTriangle,
    className: "border-amber-400/20 bg-amber-400/[0.07] text-amber-100",
    glow: "bg-amber-400",
  },
  critical: {
    label: "Ação necessária",
    description: "Existe uma configuração ou limite impedindo entregas normais.",
    icon: XCircle,
    className: "border-red-400/20 bg-red-400/[0.07] text-red-100",
    glow: "bg-red-400",
  },
};

function formatActivity(value: string | null) {
  if (!value) return "Sem atividade";
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return date.toLocaleDateString("pt-BR");
}

function Metric({ label, value, detail, icon: Icon, tone = "gold" }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: "gold" | "green" | "blue" | "violet";
}) {
  const tones = {
    gold: "bg-brand-400/10 text-brand-200 ring-brand-400/20",
    green: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
    blue: "bg-sky-400/10 text-sky-300 ring-sky-400/20",
    violet: "bg-violet-400/10 text-violet-300 ring-violet-400/20",
  };
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-3 font-serif text-3xl font-bold text-brand-100">{value}</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-400">{detail}</p>
        </div>
        <span className={cn("rounded-xl p-2.5 ring-1", tones[tone])}><Icon className="h-5 w-5" /></span>
      </div>
    </article>
  );
}

function Integration({ label, enabled, detail, icon: Icon }: {
  label: string;
  enabled: boolean;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3.5">
      <span className={cn("rounded-lg p-2", enabled ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
      </div>
      <span className={cn("h-2 w-2 rounded-full", enabled ? "bg-emerald-400" : "bg-red-400")} />
    </div>
  );
}

export default function WhatsAppCentralPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/whatsapp-health", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Falha ao consultar operação");
      setData(payload.data);
      window.dispatchEvent(new CustomEvent("whatsapp-health", { detail: payload.data.status }));
      setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a central");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const status = statusTheme[data?.status ?? "warning"];
  const StatusIcon = status.icon;
  const responseBalance = useMemo(() => {
    if (!data) return "—";
    return `${data.traffic.outboundHour}/${data.traffic.inboundHour}`;
  }, [data]);

  return (
    <div className="pb-24 lg:pb-8">
      <AdminHeader
        title="Central WhatsApp & IA"
        description="Acompanhe entregas, fila, inteligência, áudio e atendimento humano em uma única operação."
        eyebrow="Operação inteligente"
        icon={Bot}
        actions={
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
          </button>
        }
      />

      <section className={cn("mt-5 overflow-hidden rounded-2xl border p-5 sm:p-6", status.className)}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="relative rounded-xl bg-black/15 p-2.5">
              <StatusIcon className="h-5 w-5" />
              <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full shadow-[0_0_12px_currentColor]", status.glow)} />
            </span>
            <div>
              <h2 className="font-serif text-xl font-bold">{error ? "Central temporariamente indisponível" : status.label}</h2>
              <p className="mt-1 text-sm opacity-75">{error ?? status.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {data?.testMode.enabled && <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-amber-100 ring-1 ring-amber-400/20">Modo de teste</span>}
            <span className="rounded-full bg-black/15 px-3 py-1.5 opacity-75">Atualização automática · 20s</span>
          </div>
        </div>
      </section>

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.065] bg-surface-850/70 p-1.5 [scrollbar-width:none]">
        {([
          ["overview", "Visão geral", Activity],
          ["delivery", "Entrega e fila", Send],
          ["intelligence", "IA e áudio", Sparkles],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
              tab === value ? "bg-brand-500/15 text-brand-100 ring-1 ring-brand-400/25" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="mt-6 grid min-h-72 place-items-center rounded-2xl border border-white/[0.06] bg-surface-850/60">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-300" />
        </div>
      ) : data ? (
        <>
          {tab === "overview" && (
            <>
              <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Mensagens recebidas" value={data.traffic.inboundHour} detail="Entradas na última hora" icon={MessageCircleMore} tone="blue" />
                <Metric label="Respostas enviadas" value={data.traffic.outboundHour} detail={`Relação de saída/entrada: ${responseBalance}`} icon={Send} tone="green" />
                <Metric label="Fila de entrega" value={data.queue.pending} detail={data.queue.pending ? "Mensagens preservadas para reenvio" : "Nenhuma mensagem aguardando"} icon={Clock3} />
                <Metric label="Equipe solicitada" value={data.processing.pendingHandoffs} detail="Conversas aguardando atendimento humano" icon={Headphones} tone="violet" />
              </section>

              <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Atividade em tempo real</p>
                      <h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Pulso do atendimento</h2>
                    </div>
                    <Radio className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                      <p className="text-xs text-slate-500">Última mensagem recebida</p>
                      <p className="mt-2 font-semibold text-slate-200">{formatActivity(data.traffic.lastInboundAt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                      <p className="text-xs text-slate-500">Última resposta enviada</p>
                      <p className="mt-2 font-semibold text-slate-200">{formatActivity(data.traffic.lastOutboundAt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                      <p className="text-xs text-slate-500">Tráfego nas últimas 24h</p>
                      <p className="mt-2 font-semibold text-slate-200">{data.traffic.inboundDay} entradas · {data.traffic.outboundDay} saídas</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                      <p className="text-xs text-slate-500">Processamentos ativos</p>
                      <p className="mt-2 font-semibold text-slate-200">{data.processing.activeLocks} conversa(s)</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 sm:p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Atalhos inteligentes</p>
                  <h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Comandar operação</h2>
                  <div className="mt-5 space-y-2">
                    {[
                      ["/admin/atendimento", "Abrir conversas", "Assumir clientes e responder", MessageCircleMore],
                      ["/admin/fluxo", "Editar fluxo", "Mensagens, etapas e simulação", Workflow],
                      ["/admin/diagnostico-whatsapp", "Executar diagnóstico", "Validar conexão e credenciais", ServerCog],
                    ].map(([href, label, detail, Icon]) => (
                      <Link key={href as string} href={href as string} className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3.5 transition hover:border-brand-400/25 hover:bg-brand-500/[0.06]">
                        <Icon className="h-4 w-4 text-brand-300" />
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-200">{label as string}</p><p className="text-xs text-slate-500">{detail as string}</p></div>
                        <ArrowUpRight className="h-4 w-4 text-slate-600 group-hover:text-brand-300" />
                      </Link>
                    ))}
                  </div>
                </article>
              </section>
            </>
          )}

          {tab === "delivery" && (
            <section className="mt-5 grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 sm:p-6">
                <div className="flex items-center gap-2"><Send className="h-5 w-5 text-brand-300" /><h2 className="font-serif text-xl font-bold text-brand-100">Fila persistente</h2></div>
                <p className="mt-1 text-sm text-slate-400">Nenhuma resposta é descartada quando a API fica temporariamente ocupada.</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Pendentes" value={data.queue.pending} detail="aguardando envio" icon={Clock3} />
                  <Metric label="Em retry" value={data.queue.retrying} detail="nova tentativa" icon={RefreshCw} tone="blue" />
                  <Metric label="Erros 24h" value={data.queue.errors24h} detail="ocorrências registradas" icon={AlertTriangle} tone="violet" />
                  <Metric label="Limite diário" value={data.queue.dailyLimit} detail="bloqueadas pelo plano" icon={XCircle} tone="gold" />
                </div>
              </article>
              <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 sm:p-6">
                <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-brand-300" /><h2 className="font-serif text-xl font-bold text-brand-100">Processamento</h2></div>
                <p className="mt-1 text-sm text-slate-400">Controle de concorrência por conversa e segurança do webhook.</p>
                <div className="mt-5 space-y-3">
                  {[
                    ["Conversas em processamento", data.processing.activeLocks, "normal"],
                    ["Locks antigos", data.processing.staleLocks, data.processing.staleLocks ? "warning" : "normal"],
                    ["Duplicatas bloqueadas (24h)", data.processing.dedupProtected, "normal"],
                  ].map(([label, value, tone]) => (
                    <div key={label as string} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3.5">
                      <span className="text-sm text-slate-400">{label as string}</span>
                      <span className={cn("font-serif text-xl font-bold", tone === "warning" ? "text-amber-300" : "text-slate-100")}>{value as number}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {tab === "intelligence" && (
            <section className="mt-5 grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/[0.07] bg-surface-800/90 p-5 sm:p-6">
                <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-brand-300" /><h2 className="font-serif text-xl font-bold text-brand-100">Integrações inteligentes</h2></div>
                <div className="mt-5 space-y-2.5">
                  <Integration label="WASender API" enabled={data.integrations.wasender} detail="Recebimento e envio de mensagens" icon={Send} />
                  <Integration label="Cerebras" enabled={data.integrations.cerebras} detail="Interpretação e respostas naturais" icon={Sparkles} />
                  <Integration label="Groq Whisper" enabled={data.integrations.groq} detail="Entendimento de áudios recebidos" icon={Mic2} />
                  <Integration label="Voz masculina" enabled={data.integrations.voice} detail="Respostas faladas para dúvidas" icon={Radio} />
                </div>
              </article>
              <article className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-brand-500/[0.1] via-surface-800 to-surface-800 p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">Configuração recomendada</p>
                <h2 className="mt-1 font-serif text-xl font-bold text-brand-100">Assistente rápido e humano</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">Perguntas objetivas usam primeiro os dados seguros do catálogo. A IA entra quando precisa interpretar linguagem livre, com fallback automático para evitar silêncio.</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Link href="/admin/bot/prompts" className="btn-primary justify-center"><Sparkles className="h-4 w-4" /> Inteligência do bot</Link>
                  <Link href="/admin/teste-fluxo" className="btn-secondary justify-center"><Workflow className="h-4 w-4" /> Simular fluxo</Link>
                </div>
              </article>
            </section>
          )}
        </>
      ) : null}

      {updatedAt && <p className="mt-5 text-right text-xs text-slate-600">Central atualizada às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
    </div>
  );
}
