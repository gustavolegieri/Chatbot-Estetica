"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FlaskConical,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface TestLog {
  timestamp: string;
  step: string;
  status: "success" | "error" | "pending";
  message: string;
}

const FLOW_STEPS = [
  { id: "welcome", name: "Boas-vindas", description: "Mensagem inicial e apresentação da empresa", icon: "👋" },
  { id: "name_collection", name: "Identificação", description: "Coleta o nome do cliente", icon: "👤" },
  { id: "main_menu", name: "Menu principal", description: "Apresenta as categorias de serviço", icon: "📋" },
  { id: "submenu", name: "Catálogo", description: "Mostra os serviços da categoria", icon: "📑" },
  { id: "undecided_vehicle", name: "Cliente indeciso", description: "Entende o veículo do cliente", icon: "🚗" },
  { id: "undecided_problem", name: "Diagnóstico", description: "Entende a necessidade e recomenda", icon: "🔍" },
  { id: "package_action", name: "Pacotes", description: "Apresenta ações do pacote escolhido", icon: "📦" },
  { id: "service_action", name: "Serviço", description: "Apresenta ações do serviço escolhido", icon: "🧽" },
  { id: "vehicle_collection", name: "Dados do veículo", description: "Coleta modelo, ano, cor e condição", icon: "🚘" },
  { id: "quote", name: "Orçamento", description: "Apresenta a estimativa do serviço", icon: "💰" },
  { id: "first_time_bonus", name: "Primeira visita", description: "Oferece o benefício de boas-vindas", icon: "🎁" },
  { id: "upsell", name: "Complemento", description: "Sugere serviço complementar relevante", icon: "⭐" },
  { id: "day_selection", name: "Dia", description: "Mostra o calendário disponível", icon: "📅" },
  { id: "time_selection", name: "Horário", description: "Apresenta horários livres", icon: "⏰" },
  { id: "coupon", name: "Cupom", description: "Valida o código promocional", icon: "🎟️" },
  { id: "loyalty", name: "Fidelidade", description: "Consulta o uso de pontos", icon: "🌟" },
  { id: "budget_confirmation", name: "Confirmação", description: "Confirma o orçamento final", icon: "✅" },
  { id: "logistics", name: "Logística", description: "Define entrega ou retirada", icon: "🚚" },
  { id: "payment", name: "Pagamento", description: "Apresenta os meios de pagamento", icon: "💳" },
  { id: "pix_choice", name: "Escolha PIX", description: "Define o momento do PIX", icon: "📱" },
  { id: "receipt_upload", name: "Comprovante", description: "Solicita o comprovante de pagamento", icon: "📄" },
  { id: "reminder", name: "Lembrete", description: "Configura a comunicação prévia", icon: "🔔" },
  { id: "summary_confirmation", name: "Resumo final", description: "Confirma todas as informações", icon: "📝" },
];

const logStyles = {
  success: { label: "Concluído", icon: CheckCircle2, box: "bg-emerald-900/40 text-emerald-400", line: "border-emerald-700/35 bg-emerald-950/15" },
  error: { label: "Falhou", icon: XCircle, box: "bg-red-900/40 text-red-400", line: "border-red-700/35 bg-red-950/15" },
  pending: { label: "Em andamento", icon: Clock3, box: "bg-amber-900/40 text-amber-400", line: "border-amber-700/35 bg-amber-950/15" },
};

export default function TesteFluxoPage() {
  const [phone, setPhone] = useState("5511972851072");
  const [selectedStep, setSelectedStep] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [testMode, setTestMode] = useState<"individual" | "sequence">("individual");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sequenceProgress, setSequenceProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const addLog = (step: string, status: TestLog["status"], message: string) => {
    setLogs((previous) => [
      ...previous,
      { timestamp: new Date().toLocaleTimeString("pt-BR"), step, status, message },
    ]);
  };

  const testIndividualStep = async () => {
    if (!selectedStep) {
      setNotice("Escolha uma etapa antes de iniciar o teste.");
      return;
    }

    setIsRunning(true);
    setNotice(null);
    setLogs([]);
    addLog(selectedStep, "pending", "Solicitando o envio da etapa.");

    try {
      const response = await fetch("/api/admin/teste-fluxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, step: selectedStep, mode: "individual" }),
      });
      const result = await response.json();

      if (result.success) {
        addLog(selectedStep, result.queued ? "pending" : "success", result.message || (result.queued ? "Etapa enfileirada devido ao limite da API." : "Etapa enviada com sucesso."));
      } else {
        addLog(selectedStep, "error", result.message || result.error || "Não foi possível enviar a etapa.");
      }
    } catch {
      addLog(selectedStep, "error", "Erro de conexão com o laboratório de fluxo.");
    } finally {
      setIsRunning(false);
    }
  };

  const testSequence = async () => {
    setIsRunning(true);
    setNotice(null);
    setLogs([]);
    setSequenceProgress(0);
    addLog("Sequência", "pending", "Solicitando a sequência completa.");

    try {
      const response = await fetch("/api/admin/teste-fluxo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, mode: "sequence" }),
      });
      const result = await response.json();

      if (result.success) {
        setSessionId(result.sessionId);
        addLog("Sequência", "success", "Sequência iniciada. O sistema respeitará o intervalo do provedor.");
      } else {
        addLog("Sequência", "error", result.error || "Não foi possível iniciar a sequência.");
        setIsRunning(false);
      }
    } catch {
      addLog("Sequência", "error", "Erro de conexão ao iniciar a sequência.");
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!sessionId || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        const statusResponse = await fetch("/api/admin/teste-fluxo/status?sessionId=" + encodeURIComponent(sessionId));
        const statusData = await statusResponse.json();

        if (statusData.completed) {
          clearInterval(interval);
          setIsRunning(false);
          setSequenceProgress(100);
          addLog("Sequência", "success", "Teste em sequência concluído.");
          setSessionId(null);
        } else if (statusData.currentStep) {
          setSequenceProgress((Number(statusData.currentStep) / FLOW_STEPS.length) * 100);
          addLog(statusData.currentStepName || "Etapa " + statusData.currentStep, "success", "Etapa " + statusData.currentStep + " de " + FLOW_STEPS.length + " concluída.");
        }
      } catch {
        clearInterval(interval);
        setIsRunning(false);
        setSessionId(null);
        addLog("Sequência", "error", "Não foi possível consultar o status da sequência.");
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, isRunning]);

  const selected = FLOW_STEPS.find((step) => step.id === selectedStep);

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Laboratório do fluxo"
        description="Valide cada ponto da jornada oficial do WhatsApp antes de liberar mudanças."
        actions={
          <span className="inline-flex items-center gap-2 rounded-lg border border-brand-700/35 bg-brand-950/25 px-3 py-2 text-xs font-medium text-brand-200">
            <FlaskConical className="h-4 w-4" />
            Fluxo oficial
          </span>
        }
      />

      {notice && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          <CircleAlert className="h-4 w-4" /> {notice}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="card p-0">
          <div className="border-b border-surface-700 px-5 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/40"><Activity className="h-5 w-5 text-brand-300" /></div>
              <div>
                <h2 className="font-semibold text-brand-100">Configuração da execução</h2>
                <p className="mt-1 text-sm text-slate-400">Escolha o formato de validação e o número autorizado para o teste.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setTestMode("individual")} className={testMode === "individual" ? "rounded-xl border border-brand-500/55 bg-brand-950/35 p-4 text-left shadow-gold" : "rounded-xl border border-surface-600 bg-surface-850 p-4 text-left transition hover:border-surface-500"}>
                <p className={testMode === "individual" ? "text-sm font-semibold text-brand-200" : "text-sm font-semibold text-slate-300"}>Etapa individual</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Valide um trecho específico da experiência.</p>
              </button>
              <button type="button" onClick={() => setTestMode("sequence")} className={testMode === "sequence" ? "rounded-xl border border-brand-500/55 bg-brand-950/35 p-4 text-left shadow-gold" : "rounded-xl border border-surface-600 bg-surface-850 p-4 text-left transition hover:border-surface-500"}>
                <p className={testMode === "sequence" ? "text-sm font-semibold text-brand-200" : "text-sm font-semibold text-slate-300"}>Sequência completa</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Percorra as etapas respeitando o limite do provedor.</p>
              </button>
            </div>
          </div>
          <div className="p-5">
            <label className="block">
              <span className="label">Número de teste *</span>
              <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="5511972851072" className="input max-w-xl" />
              <span className="mt-1.5 block text-xs text-slate-500">Use DDI + DDD + número e mantenha o modo de teste ativo quando necessário.</span>
            </label>

            {testMode === "individual" ? (
              <div className="mt-5">
                <label className="block">
                  <span className="label">Etapa para validar</span>
                  <select value={selectedStep} onChange={(event) => setSelectedStep(event.target.value)} className="input">
                    <option value="">Selecione uma etapa...</option>
                    {FLOW_STEPS.map((step, index) => <option key={step.id} value={step.id}>{String(index + 1).padStart(2, "0")} · {step.icon} {step.name} — {step.description}</option>)}
                  </select>
                </label>
                {selected && (
                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand-700/30 bg-brand-950/20 p-4">
                    <span className="text-xl">{selected.icon}</span>
                    <div><p className="text-sm font-semibold text-brand-100">{selected.name}</p><p className="mt-1 text-xs leading-5 text-slate-400">{selected.description}</p></div>
                  </div>
                )}
                <button type="button" onClick={() => void testIndividualStep()} disabled={isRunning || !selectedStep} className="btn-primary mt-5 min-w-48 gap-2">
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isRunning ? "Enviando..." : "Executar etapa"}
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <div className="rounded-xl border border-brand-700/30 bg-brand-950/20 p-4">
                  <p className="text-sm font-semibold text-brand-100">Sequência protegida por intervalo</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">O laboratório aguarda entre envios para respeitar a limitação de taxa da WasenderAPI.</p>
                </div>
                {isRunning && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-400"><span>Progresso da sequência</span><span>{Math.round(sequenceProgress)}%</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-gold-gradient transition-all duration-500" style={{ width: sequenceProgress + "%" }} /></div>
                  </div>
                )}
                <button type="button" onClick={() => void testSequence()} disabled={isRunning} className="btn-primary mt-5 min-w-52 gap-2">
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {isRunning ? "Executando sequência..." : "Iniciar sequência"}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h2 className="font-semibold text-amber-200">Limite do provedor</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/75">O plano de teste da API pode limitar a 50 mensagens ao dia. Um erro 429 pode indicar rate limit temporário ou limite diário.</p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-900/35 text-violet-400 ring-1 ring-violet-700/40"><Sparkles className="h-5 w-5" /></div>
              <div><h2 className="font-semibold text-brand-100">Cobertura</h2><p className="text-xs text-slate-500">Jornada CRM + IA</p></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-850 p-3"><p className="text-xs text-slate-500">Etapas</p><p className="mt-1 text-xl font-semibold text-slate-100">{FLOW_STEPS.length}</p></div>
              <div className="rounded-xl bg-surface-850 p-3"><p className="text-xs text-slate-500">Modo atual</p><p className="mt-1 text-sm font-semibold text-brand-200">{testMode === "individual" ? "Pontual" : "Completo"}</p></div>
            </div>
          </div>
        </aside>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-surface-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-900/35 text-sky-400 ring-1 ring-sky-700/40"><ListChecks className="h-4 w-4" /></div>
            <div><h2 className="font-semibold text-brand-100">Mapa da jornada</h2><p className="text-sm text-slate-400">Todas as etapas disponíveis no laboratório.</p></div>
          </div>
          <span className="text-xs font-medium text-slate-500">{FLOW_STEPS.length} pontos de controle</span>
        </div>
        <div className="grid max-h-[360px] overflow-y-auto divide-x divide-y divide-surface-700 sm:grid-cols-2 xl:grid-cols-3">
          {FLOW_STEPS.map((step, index) => (
            <div key={step.id} className={selectedStep === step.id ? "flex gap-3 bg-brand-950/20 p-4" : "flex gap-3 bg-surface-800 p-4 transition hover:bg-surface-750/40"}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-700 text-xs font-bold text-brand-200">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-200">{step.icon} {step.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{step.description}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-700 text-brand-300"><TerminalSquare className="h-4 w-4" /></div>
            <div><h2 className="font-semibold text-brand-100">Eventos de execução</h2><p className="text-sm text-slate-400">Acompanhe o retorno do laboratório.</p></div>
          </div>
          <button type="button" onClick={() => setLogs([])} disabled={logs.length === 0} className="btn-secondary gap-2 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Limpar</button>
        </div>
        {logs.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><TerminalSquare className="h-9 w-9 text-surface-500" /><p className="mt-3 text-sm font-medium text-slate-300">Aguardando execução</p><p className="mt-1 text-xs text-slate-500">Os eventos aparecerão aqui quando você iniciar um teste.</p></div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto p-4">
            {logs.map((log, index) => {
              const style = logStyles[log.status];
              const Icon = style.icon;
              return (
                <article key={log.timestamp + "-" + index} className={"flex gap-3 rounded-xl border p-3 " + style.line}>
                  <div className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + style.box}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-200">{log.step}</span><span className="text-xs text-slate-500">{log.timestamp}</span><span className="rounded-full bg-surface-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{style.label}</span></div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{log.message}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
