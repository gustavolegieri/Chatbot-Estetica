"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Camera,
  CarFront,
  CheckCircle2,
  CircleDot,
  Clock3,
  Eye,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { cn } from "@/lib/utils";

type RecordData = Record<string, any>;

const flow = [
  { id: "WAITING", label: "Portão livre", detail: "IA observando", icon: Eye },
  { id: "WASHING", label: "Lavagem iniciada", detail: "Veículo entrou", icon: CarFront },
  { id: "FINALIZING", label: "Em finalização", detail: "Veículo saiu da lavagem", icon: Sparkles },
];

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-white/[0.07] bg-surface-800/90 p-5 shadow-[0_22px_60px_rgba(0,0,0,.18)]", className)}>{children}</section>;
}

function PanelTitle({ icon: Icon, title, subtitle }: { icon: typeof Activity; title: string; subtitle: string }) {
  return <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-400/10 text-brand-300 ring-1 ring-brand-400/15"><Icon className="h-5 w-5" /></span><div><h2 className="text-sm font-bold text-slate-100">{title}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{subtitle}</p></div></div>;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Nenhuma leitura";
}

function statusLabel(status: string) {
  return ({ PENDING: "Pendente", CONFIRMED: "Confirmado", IN_PROGRESS: "Em lavagem", FINALIZING: "Em finalização", COMPLETED: "Finalizado" } as Record<string, string>)[status] || status;
}

export function GateVisionPanel() {
  const [data, setData] = useState<RecordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [simulation, setSimulation] = useState<RecordData | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/gate-vision", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Falha ao carregar");
      setData(payload.data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o Portão IA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function runSimulation() {
    setSimulating(true);
    try {
      const response = await fetch("/api/admin/gate-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate" }),
      });
      const payload = await response.json();
      if (payload.success) setSimulation(payload.data);
    } finally {
      setSimulating(false);
    }
  }

  if (loading && !data) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand-300" /></div>;
  if (!data) return <div className="rounded-3xl border border-red-400/20 bg-red-400/[0.06] p-8 text-sm text-red-200">{error}</div>;

  return <div className="pb-24 lg:pb-8">
    <AdminHeader
      title="Portão IA"
      description="A webcam inicia a lavagem na entrada e coloca o veículo em finalização na saída."
      eyebrow="Automação visual"
      icon={ScanLine}
      actions={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-500/25 bg-brand-500/10 px-3.5 py-2 text-xs font-semibold text-brand-100"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Atualizar</button>}
    />

    <div className="relative mb-6 overflow-hidden rounded-[30px] border border-brand-500/15 bg-[radial-gradient(circle_at_85%_15%,rgba(212,175,55,.13),transparent_28%),linear-gradient(135deg,#151618,#0d0e10)] p-6 sm:p-8">
      <div className="absolute -right-12 -top-12 h-52 w-52 rounded-full border border-brand-400/10"><div className="absolute inset-8 rounded-full border border-brand-400/10" /></div>
      <div className="relative grid gap-7 lg:grid-cols-[1fr_380px] lg:items-center">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-brand-400/15 bg-brand-400/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-brand-200"><Camera className="h-3.5 w-3.5" />Visão computacional local</div><h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold text-white sm:text-4xl">Um portão. Duas direções. Zero atualização manual.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">O vídeo permanece no computador da estética. O CRM recebe a passagem, a placa reconhecida e a confiança da leitura.</p></div>
        <div className="rounded-3xl border border-white/[0.07] bg-black/20 p-4 backdrop-blur"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={cn("grid h-10 w-10 place-items-center rounded-xl", data.online ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300")}>{data.online ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}</span><div><strong className={cn("block text-xs", data.online ? "text-emerald-200" : "text-amber-200")}>{data.online ? "Câmera conectada" : "Agente ainda offline"}</strong><span className="text-[9px] text-slate-600">{formatDate(data.lastHeartbeatAt)}</span></div></div><span className={cn("h-2.5 w-2.5 rounded-full", data.online ? "animate-pulse bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" : "bg-amber-400")} /></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-xl bg-white/[0.035] p-2.5 text-slate-500">Modelo<strong className="mt-1 block truncate text-slate-200">{data.camera.model}</strong></div><div className="rounded-xl bg-white/[0.035] p-2.5 text-slate-500">Resolução<strong className="mt-1 block text-slate-200">{data.camera.resolution}</strong></div></div></div>
      </div>
    </div>

    {error && <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-100">{error}</div>}

    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Etapa atual", value: data.stageMeta.label, detail: data.stageMeta.description, icon: Activity, tone: "brand" },
        { label: "Entradas em 7 dias", value: data.metrics.entriesWeek, detail: "Lavagens iniciadas pela câmera", icon: ArrowDown, tone: "blue" },
        { label: "Saídas em 7 dias", value: data.metrics.exitsWeek, detail: "Veículos enviados à finalização", icon: ArrowUp, tone: "green" },
        { label: "Ciclo automatizado", value: `${data.metrics.automationRate}%`, detail: "Entradas com saída correspondente", icon: Gauge, tone: "violet" },
      ].map((item) => { const Icon = item.icon; const tone = ({ brand: "bg-brand-400/10 text-brand-200", blue: "bg-sky-400/10 text-sky-300", green: "bg-emerald-400/10 text-emerald-300", violet: "bg-violet-400/10 text-violet-300" } as Record<string, string>)[item.tone]; return <Panel key={item.label} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-600">{item.label}</p><strong className="mt-2 block font-serif text-2xl text-brand-100">{item.value}</strong></div><span className={cn("rounded-xl p-2.5", tone)}><Icon className="h-5 w-5" /></span></div><p className="mt-2 text-[10px] leading-4 text-slate-500">{item.detail}</p></Panel>; })}
    </div>

    {data.dailyReport && <Panel className="mb-6 border-violet-400/15 bg-[linear-gradient(135deg,rgba(139,92,246,.07),rgba(0,0,0,.08))]"><PanelTitle icon={Gauge} title={`Relatório inteligente · ${data.dailyReport.date}`} subtitle={data.dailyReport.source === "cerebras" ? "Resumo operacional produzido pela IA" : "Resumo operacional automático"} /><p className="text-sm leading-6 text-slate-300">{data.dailyReport.summary}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{[{ label: "Entradas", value: data.dailyReport.metrics.entries }, { label: "Saídas", value: data.dailyReport.metrics.exits }, { label: "Tempo médio", value: `${data.dailyReport.metrics.averageMinutes} min` }, { label: "Atrasos", value: data.dailyReport.metrics.delayed }, { label: "Sem placa", value: data.dailyReport.metrics.unmatched }, { label: "Timelapses", value: data.dailyReport.metrics.timelapsesSent }].map((item) => <div key={item.label} className="rounded-xl bg-white/[0.035] p-3 text-center"><strong className="block text-base text-brand-100">{item.value}</strong><span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-slate-600">{item.label}</span></div>)}</div></Panel>}

    <Panel className="mb-6">
      <PanelTitle icon={ScanLine} title="Fluxo oficial da garagem" subtitle="Uma única risca representa o portão: cruzou para dentro, inicia a lavagem; cruzou para fora, inicia a finalização." />
      <div className="grid gap-3 lg:grid-cols-[1fr_70px_1fr_70px_1fr] lg:items-center">{flow.map((item, index) => { const Icon = item.icon; const active = data.stage === item.id; return <div key={item.id} className="contents"><div className={cn("rounded-2xl border p-4 transition", active ? "border-brand-300/30 bg-brand-300/[0.075] shadow-[0_0_30px_rgba(212,175,55,.08)]" : "border-white/[0.06] bg-black/10")}><div className="flex items-center gap-3"><span className={cn("grid h-11 w-11 place-items-center rounded-xl", active ? "bg-brand-300 text-black" : "bg-white/[0.04] text-slate-600")}><Icon className="h-5 w-5" /></span><div><span className="text-[8px] font-bold uppercase tracking-widest text-slate-600">Estado {index + 1}</span><strong className={cn("mt-1 block text-xs", active ? "text-brand-100" : "text-slate-400")}>{item.label}</strong><p className="mt-0.5 text-[9px] text-slate-600">{item.detail}</p></div></div></div>{index < flow.length - 1 && <div className="hidden text-center lg:block"><span className="text-[8px] font-bold uppercase tracking-wider text-brand-500">{index === 0 ? "entrou" : "saiu"}</span><div className="mt-1 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" /></div>}</div>; })}</div>
      {data.current.clientName && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/15 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><CarFront className="h-5 w-5" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-100">{data.current.clientName}</strong><p className="mt-0.5 truncate text-[10px] text-slate-500">{data.current.vehicle || "Veículo"} · {data.current.service || "Serviço"}</p></div>{data.current.plate && <span className="rounded-lg border border-brand-300/20 bg-brand-300/[0.07] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-brand-100">{data.current.plate}</span>}<span className="text-[9px] text-slate-600">desde {formatDate(data.current.since)}</span></div>}
    </Panel>

    <div className="grid gap-6 xl:grid-cols-[1.02fr_.98fr]">
      <Panel><PanelTitle icon={Clock3} title="Eventos do portão" subtitle="Histórico auditável com placa, associação, confiança e leituras descartadas." /><div className="max-h-[520px] space-y-3 overflow-y-auto border-l border-brand-400/15 pl-4">{data.timeline.map((item: RecordData) => <article key={item.id} className="relative"><span className={cn("absolute -left-[20.5px] top-4 h-2 w-2 rounded-full", item.type === "ENTER" ? "bg-sky-400" : item.type === "EXIT" ? "bg-emerald-400" : "bg-slate-600")} /><div className="rounded-2xl border border-white/[0.05] bg-black/10 p-3"><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-200">{item.label}</strong><span className={cn("rounded-full px-2 py-0.5 text-[8px] font-bold", item.matched ? "bg-emerald-400/10 text-emerald-300" : item.type === "IGNORED" ? "bg-slate-700/50 text-slate-500" : "bg-amber-400/10 text-amber-300")}>{item.matched ? "agendamento associado" : item.type === "IGNORED" ? "descartado" : "sem associação"}</span>{item.plate && <span className="rounded border border-brand-300/15 bg-brand-300/[0.06] px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider text-brand-200">{item.plate} · {Math.round((item.plateConfidence || 0) * 100)}%</span>}</div><span className="shrink-0 text-[8px] text-slate-600">{formatDate(item.at)}</span></div><p className="mt-2 text-[10px] text-slate-500">{item.clientName ? `${item.clientName}${item.vehicle ? ` · ${item.vehicle}` : ""}` : item.reason || "Detecção automática do veículo"}</p>{item.confidence > 0 && <div className="mt-2 flex items-center gap-2"><div className="h-1 flex-1 rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-brand-300" style={{ width: `${Math.round(item.confidence * 100)}%` }} /></div><span className="text-[8px] text-brand-300">veículo {Math.round(item.confidence * 100)}%</span></div>}{item.timelapseUrl && <a href={item.timelapseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-400/10 px-2.5 py-1.5 text-[9px] font-bold text-violet-200"><Play className="h-3 w-3" />Assistir timelapse{item.timelapseSent ? " · enviado" : ""}</a>}</div></article>)}{!data.timeline.length && <p className="py-12 text-center text-xs text-slate-600">Os eventos aparecerão após conectar a webcam.</p>}</div></Panel>
      <Panel><PanelTitle icon={CalendarClock} title="Agenda usada pela automação" subtitle="Entrada e saída só são associadas quando a placa lida coincide exatamente com a placa cadastrada." /><div className="space-y-2">{data.appointments.map((item: RecordData) => { const visualStatus = item.isCurrent && data.stage === "FINALIZING" ? "FINALIZING" : item.status; return <article key={item.id} className={cn("flex items-center gap-3 rounded-2xl border p-3", item.isCurrent ? "border-brand-400/25 bg-brand-400/[0.06]" : "border-white/[0.055] bg-black/10")}><span className="grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-brand-400/10 font-mono text-xs font-bold text-brand-200">{item.time}</span><div className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-200">{item.clientName}</strong><p className="mt-1 truncate text-[9px] text-slate-600">{item.vehicle || "Veículo não informado"} · {item.service}</p></div>{item.plate ? <span className="rounded-lg bg-white/[0.045] px-2 py-1 font-mono text-[9px] font-bold tracking-wider text-slate-300">{item.plate}</span> : <span className="text-[8px] font-bold text-amber-300">sem placa</span>}<span className={cn("rounded-full px-2 py-1 text-[8px] font-bold", visualStatus === "IN_PROGRESS" ? "bg-sky-400/10 text-sky-300" : visualStatus === "FINALIZING" ? "bg-violet-400/10 text-violet-300" : visualStatus === "COMPLETED" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-slate-500")}>{statusLabel(visualStatus)}</span></article>; })}{!data.appointments.length && <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-600">Nenhum atendimento na agenda de hoje.</p>}</div></Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel>
        <PanelTitle icon={Camera} title="Como instalar a câmera" subtitle="A linha virtual deve ficar exatamente sobre a risca física do portão na rampa." />
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#090a0b] p-5">
          <div className="grid h-44 grid-rows-[1fr_auto_1fr] text-center">
            <div className="flex items-center justify-center text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">Rua / rampa / lado de fora</div>
            <div className="flex items-center gap-3">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-brand-300" />
              <span className="rounded-xl border border-brand-300/25 bg-brand-300/[0.08] px-4 py-2 text-[10px] font-bold text-brand-100">RISCA DO PORTÃO</span>
              <CarFront className="h-6 w-6 text-brand-300" />
              <div className="h-[2px] flex-1 bg-gradient-to-r from-brand-300 to-transparent" />
            </div>
            <div className="flex items-center justify-center text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">Garagem / lado de dentro</div>
          </div>
        </div>
        <div className={cn("mt-4 rounded-2xl border p-3 text-[10px] leading-5", data.configuration.tokenConfigured ? "border-emerald-400/15 bg-emerald-400/[0.04] text-emerald-200" : "border-amber-400/15 bg-amber-400/[0.04] text-amber-100")}>{data.configuration.tokenConfigured ? <><CheckCircle2 className="mr-2 inline h-4 w-4" />Token da câmera configurado no servidor.</> : <>Configure <strong>GATE_VISION_DEVICE_TOKEN</strong> na Vercel antes de ligar o agente local.</>}</div>
      </Panel>
      <Panel><PanelTitle icon={ShieldCheck} title="Teste seguro do reconhecimento" subtitle="Reproduz entrada, OCR da placa e saída sem tocar na agenda ou enviar WhatsApp." /><button type="button" onClick={() => void runSimulation()} disabled={simulating} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-300 px-4 py-3 text-xs font-extrabold text-black transition hover:bg-brand-200 disabled:opacity-60">{simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Simular passagem completa</button>{simulation ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{simulation.events.map((item: RecordData) => <div key={item.type} className="rounded-2xl border border-white/[0.06] bg-black/10 p-4"><div className="flex items-center justify-between"><span className={cn("grid h-9 w-9 place-items-center rounded-xl", item.type === "ENTER" ? "bg-sky-400/10 text-sky-300" : "bg-emerald-400/10 text-emerald-300")}>{item.type === "ENTER" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</span><span className="text-[9px] font-bold text-brand-300">{Math.round(item.confidence * 100)}%</span></div><strong className="mt-3 block text-xs text-slate-100">{item.label}</strong><p className="mt-1 font-mono text-[10px] font-bold tracking-wider text-slate-300">{item.plate} · OCR {Math.round(item.plateConfidence * 100)}%</p><p className="mt-1 text-[9px] text-slate-600">{item.positions.length} posições acompanhadas</p></div>)}</div> : <div className="mt-4 grid min-h-44 place-items-center rounded-2xl border border-dashed border-white/10 text-center"><div><CircleDot className="mx-auto h-7 w-7 text-slate-700" /><p className="mt-3 text-[10px] leading-5 text-slate-600">O teste valida as duas direções<br />sem produzir ações reais.</p></div></div>}</Panel>
    </div>
  </div>;
}
