"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Gauge,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

interface TestBotMessage {
  text: string;
  sender: "user" | "bot";
  timestamp: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "document";
}

interface FlowState {
  stage: string;
  welcomed?: boolean;
  customerName?: string;
  serviceKey?: string;
  serviceLabel?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  vehicleCondition?: string;
  quoteMin?: number;
  quoteMax?: number;
  dayDate?: string;
  dayLabel?: string;
  startTime?: string;
  paymentMethod?: string;
  [key: string]: unknown;
}

interface AiStatus {
  configured: boolean;
  model: string;
}

const flowSteps = [
  { keys: ["ETAPA1"], label: "Boas-vindas", detail: "Identificação do cliente" },
  { keys: ["ETAPA2", "ETAPA3"], label: "Serviço", detail: "Descoberta e interesse" },
  { keys: ["ETAPA4", "ETAPA5"], label: "Veículo & orçamento", detail: "Dados e proposta" },
  { keys: ["ETAPA6", "ETAPA7", "ETAPA8"], label: "Agenda & pagamento", detail: "Horário e confirmação" },
  { keys: ["ETAPA9", "ETAPA10", "ETAPA11", "ETAPA12", "ETAPA13", "ETAPA14", "ETAPA15", "ETAPA16"], label: "Pós-venda", detail: "Finalização e relacionamento" },
];

const quickMessages = ["Olá!", "Quero agendar", "Quais serviços vocês fazem?", "Quanto custa o polimento?"];

function getCurrentStep(stage: string) {
  const index = flowSteps.findIndex((step) => step.keys.some((key) => stage.startsWith(key)));
  return index < 0 ? 0 : index;
}

function formatMoney(value?: number) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function parseMediaTag(text: string) {
  const match = text.match(/^\[MÍDIA:\s*(image|video|document)\|([^\]]+)\]\s*([\s\S]*)$/i);
  if (!match) return { cleanText: text };
  return { cleanText: match[3].trim(), mediaType: match[1] as TestBotMessage["mediaType"], mediaUrl: match[2] };
}

export default function TestBotPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TestBotMessage[]>([]);
  const [flowState, setFlowState] = useState<FlowState>({ stage: "ETAPA1_AWAITING_NAME" });
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useRealAI, setUseRealAI] = useState(true);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentStep = useMemo(() => getCurrentStep(flowState.stage), [flowState.stage]);
  const customerName = flowState.customerName || "Novo contato";
  const vehicle = [flowState.vehicleModel, flowState.vehicleYear, flowState.vehicleColor].filter(Boolean).join(" · ") || "Ainda não informado";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function resetSession() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, sessionId, useRealAI }),
      });
      const data = await response.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setMessages(data.messages || []);
        setFlowState(data.flowState);
        setAi(data.ai || null);
      }
    } catch (error) {
      console.error("Erro ao iniciar sessão de teste:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void resetSession();
    // A sessão de teste deve ser criada apenas uma vez por abertura da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(value = inputText) {
    const text = value.trim();
    if (!text || isLoading) return;

    setInputText("");
    setMessages((previous) => [...previous, { text, sender: "user", timestamp: new Date().toISOString() }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sessionId, useRealAI, flowState, messages }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Não foi possível processar a mensagem.");

      setSessionId(data.sessionId);
      setAi(data.ai || null);
      setFlowState(data.flowState);
      setMessages(
        (data.messages as TestBotMessage[]).map((message) => {
          if (message.sender !== "bot") return message;
          const media = parseMediaTag(message.text);
          return { ...message, text: media.cleanText, mediaUrl: media.mediaUrl, mediaType: media.mediaType };
        })
      );
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setMessages((previous) => [
        ...previous,
        { text: "Não foi possível processar a mensagem agora. Tente novamente.", sender: "bot", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteSession() {
    if (!sessionId || isLoading) return;
    setIsLoading(true);
    try {
      await fetch(`/api/admin/test-bot?sessionId=${sessionId}`, { method: "DELETE" });
      setSessionId(null);
      setMessages([]);
      setFlowState({ stage: "ETAPA1_AWAITING_NAME" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1640px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-brand-800/30 bg-surface-850 px-5 py-4 shadow-gold sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/20">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white">Central de fluxo WhatsApp</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-400/20">Oficial</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-400">Simule a jornada do cliente e acompanhe cada dado capturado pelo bot.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetSession} disabled={isLoading} className="btn-secondary gap-2">
            <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Nova simulação
          </button>
          <button onClick={deleteSession} disabled={!sessionId || isLoading} title="Encerrar simulação" className="rounded-lg border border-surface-600 p-2.5 text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-brand-800/25 bg-surface-850 shadow-gold">
        <div className="flex flex-col gap-3 border-b border-surface-700 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${useRealAI && ai?.configured ? "bg-brand-300/15 text-brand-300" : "bg-surface-700 text-slate-400"}`}>
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Cerebras AI</p>
              <p className="text-xs text-slate-400">
                {ai === null ? "Verificando configuração…" : ai.configured ? `${ai.model} pronto para enriquecer o fluxo` : "Configure CEREBRAS_API_KEY para ativar a IA"}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useRealAI}
            onClick={() => setUseRealAI((enabled) => !enabled)}
            className="flex items-center gap-3 self-start text-sm text-slate-300 lg:self-auto"
          >
            <span>Assistência inteligente</span>
            <span className={`relative h-6 w-11 rounded-full transition ${useRealAI ? "bg-brand-400" : "bg-surface-600"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${useRealAI ? "left-6" : "left-1"}`} />
            </span>
          </button>
        </div>

        <div className="overflow-x-auto px-5 py-5">
          <div className="flex min-w-[760px] items-start">
            {flowSteps.map((step, index) => {
              const state = index < currentStep ? "done" : index === currentStep ? "current" : "pending";
              return (
                <div key={step.label} className="flex min-w-0 flex-1 items-start last:flex-none">
                  <div className="min-w-[112px]">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${state === "done" ? "bg-emerald-500 text-white" : state === "current" ? "bg-brand-300 text-surface-950 shadow-gold" : "bg-surface-700 text-slate-500"}`}>
                        {state === "done" ? <Check className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className={`text-sm font-medium ${state === "pending" ? "text-slate-500" : "text-white"}`}>{step.label}</span>
                    </div>
                    <p className="mt-1 pl-9 text-[11px] text-slate-500">{step.detail}</p>
                  </div>
                  {index < flowSteps.length - 1 && <div className={`mt-3 h-px flex-1 ${index < currentStep ? "bg-emerald-500" : "bg-surface-700"}`} />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[285px_minmax(460px,1fr)_315px]">
        <aside className="order-2 space-y-4 xl:order-1">
          <section className="overflow-hidden rounded-2xl border border-surface-700 bg-surface-850">
            <div className="flex items-center justify-between border-b border-surface-700 px-4 py-3">
              <p className="text-sm font-semibold text-white">Ficha do contato</p>
              <MoreHorizontal className="h-4 w-4 text-slate-500" />
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-300/15 text-brand-300"><UserRound className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="truncate font-medium text-white">{customerName}</p><p className="text-xs text-slate-500">Lead em atendimento</p></div>
              </div>
              <div className="mt-5 space-y-4">
                <Detail label="Serviço" value={flowState.serviceLabel || "Em descoberta"} />
                <Detail label="Veículo" value={vehicle} />
                <Detail label="Condição" value={flowState.vehicleCondition || "Não informada"} />
                <Detail label="Pagamento" value={flowState.paymentMethod || "A definir"} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-surface-700 bg-surface-850 p-4">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand-300" /><p className="text-sm font-semibold text-white">Oportunidade</p></div>
            <div className="mt-4 rounded-xl bg-surface-800 p-3">
              <p className="text-xs text-slate-500">Potencial estimado</p>
              <p className="mt-1 text-xl font-semibold text-brand-200">{flowState.quoteMin
                ? flowState.quoteMax && flowState.quoteMax !== flowState.quoteMin
                  ? `${formatMoney(flowState.quoteMin)} – ${formatMoney(flowState.quoteMax)}`
                  : formatMoney(flowState.quoteMin)
                : "Aguardando orçamento"}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">Agendamento</span><span className="text-slate-200">{flowState.dayLabel || flowState.dayDate || "Não definido"}{flowState.startTime ? ` · ${flowState.startTime}` : ""}</span></div>
          </section>
        </aside>

        <main className="order-1 flex min-h-[650px] flex-col overflow-hidden rounded-2xl border border-surface-700 bg-[#0b141a] shadow-2xl xl:order-2">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#202c33] px-5 py-3.5">
            <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"><Bot className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-white">Assistente Garagem do Ka</p><p className="flex items-center gap-1 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Fluxo ativo</p></div></div>
            <MoreHorizontal className="h-5 w-5 text-slate-400" />
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(ellipse_at_center,_rgba(26,84,75,0.22),_transparent_68%)] px-4 py-5 sm:px-7">
            <div className="mx-auto w-fit rounded-md bg-black/25 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Ambiente de simulação</div>
            {messages.length === 0 && !isLoading && <div className="mx-auto mt-16 max-w-sm text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400"><Sparkles className="h-6 w-6" /></div><h2 className="mt-4 font-medium text-white">Comece uma conversa</h2><p className="mt-1 text-sm leading-6 text-slate-400">Envie uma mensagem como se fosse um cliente. O CRM e as etapas acompanham a conversa em tempo real.</p></div>}
            {messages.map((message, index) => <ChatBubble key={`${message.timestamp}-${index}`} message={message} />)}
            {isLoading && <div className="flex items-end gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"><Bot className="h-4 w-4" /></div><div className="rounded-xl rounded-bl-sm bg-[#202c33] px-4 py-3"><Loader2 className="h-4 w-4 animate-spin text-emerald-300" /></div></div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/10 bg-[#202c33] p-3 sm:p-4">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {quickMessages.map((message) => <button key={message} onClick={() => void sendMessage(message)} disabled={isLoading} className="whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:opacity-40">{message}</button>)}
            </div>
            <div className="flex items-end gap-2"><button title="Anexar mídia" className="mb-1 rounded-lg p-2 text-slate-400 transition hover:bg-white/5"><Paperclip className="h-5 w-5" /></button><textarea value={inputText} onChange={(event) => setInputText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={1} placeholder="Digite uma mensagem" disabled={isLoading} className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border-0 bg-[#2a3942] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-400/50" /><button onClick={() => void sendMessage()} disabled={!inputText.trim() || isLoading} title="Enviar mensagem" className="mb-1 rounded-xl bg-emerald-500 p-3 text-white transition hover:bg-emerald-400 disabled:bg-surface-600 disabled:text-slate-500"><SendHorizontal className="h-4 w-4" /></button></div>
          </div>
        </main>

        <aside className="order-3 space-y-4">
          <section className="rounded-2xl border border-surface-700 bg-surface-850 p-4">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-brand-300" /><p className="text-sm font-semibold text-white">Estado do fluxo</p></div><span className="rounded-md bg-brand-300/10 px-2 py-1 text-[10px] font-bold text-brand-200">ETAPA {currentStep + 1}/5</span></div>
            <div className="mt-5"><p className="text-base font-medium text-white">{flowSteps[currentStep].label}</p><p className="mt-1 text-sm text-slate-400">{flowSteps[currentStep].detail}</p></div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-gold-gradient transition-all" style={{ width: `${((currentStep + 1) / flowSteps.length) * 100}%` }} /></div>
            <div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">Progresso da jornada</span><span className="text-brand-200">{Math.round(((currentStep + 1) / flowSteps.length) * 100)}%</span></div>
          </section>

          <section className="rounded-2xl border border-surface-700 bg-surface-850 p-4">
            <button onClick={() => setShowTechnical((value) => !value)} className="flex w-full items-center justify-between text-left"><span className="flex items-center gap-2 text-sm font-semibold text-white"><CircleAlert className="h-4 w-4 text-slate-400" /> Dados técnicos</span><ChevronRight className={`h-4 w-4 text-slate-500 transition ${showTechnical ? "rotate-90" : ""}`} /></button>
            {showTechnical && <><div className="mt-4 border-t border-surface-700 pt-4"><Detail label="Estado interno" value={flowState.stage} mono /><Detail label="Sessão" value={sessionId ? `${sessionId.slice(0, 12)}…` : "Criando…"} mono /></div><pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-surface-900 p-3 text-[10px] leading-5 text-slate-400">{JSON.stringify(flowState, null, 2)}</pre></>}
          </section>

          {!ai?.configured && <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4"><div className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><p className="text-sm font-medium text-amber-100">IA aguardando configuração</p><p className="mt-1 text-xs leading-5 text-amber-200/70">Adicione <code className="rounded bg-black/20 px-1">CEREBRAS_API_KEY</code> ao ambiente para respostas e análises inteligentes.</p></div></div></section>}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 truncate text-sm text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}

function WhatsAppText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g);
  return <p className="whitespace-pre-wrap break-words text-sm leading-5">{parts.map((part, index) => {
    if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`[^`\n]+`$/.test(part)) return <code key={index} className="rounded bg-black/20 px-1 py-0.5 text-[0.92em]">{part.slice(1, -1)}</code>;
    return part;
  })}</p>;
}

function ChatBubble({ message }: { message: TestBotMessage }) {
  const isCustomer = message.sender === "user";
  return <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}><div className={`max-w-[84%] rounded-xl px-3 py-2 shadow-sm sm:max-w-[75%] ${isCustomer ? "rounded-br-sm bg-[#005c4b] text-white" : "rounded-bl-sm bg-[#202c33] text-slate-100"}`}>
    {message.mediaUrl && message.mediaType === "image" && <img src={message.mediaUrl} alt="Mídia enviada pelo bot" className="mb-2 max-h-72 w-full rounded-lg object-cover" />}
    {message.mediaUrl && message.mediaType === "video" && <video src={message.mediaUrl} controls className="mb-2 max-h-72 w-full rounded-lg" />}
    {message.mediaUrl && message.mediaType === "document" && <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 rounded-lg bg-black/15 p-2 text-xs underline"><Paperclip className="h-4 w-4" /> Abrir documento</a>}
    {message.text && <WhatsAppText text={message.text} />}
    <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isCustomer ? "text-emerald-100/70" : "text-slate-500"}`}><span>{formatTime(message.timestamp)}</span>{isCustomer && <Check className="h-3 w-3" />}</div>
  </div></div>;
}
