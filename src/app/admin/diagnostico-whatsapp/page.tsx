"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface DiagnosticResult {
  name: string;
  status: "success" | "error" | "warning";
  message: string;
  details?: string;
}

const statusStyles = {
  success: {
    icon: CheckCircle2,
    line: "border-emerald-700/40 bg-emerald-950/25",
    iconBox: "bg-emerald-900/40 text-emerald-400 ring-emerald-700/40",
    label: "Operacional",
    labelClass: "bg-emerald-900/45 text-emerald-300",
  },
  warning: {
    icon: AlertCircle,
    line: "border-amber-700/40 bg-amber-950/20",
    iconBox: "bg-amber-900/40 text-amber-400 ring-amber-700/40",
    label: "Atenção",
    labelClass: "bg-amber-900/45 text-amber-300",
  },
  error: {
    icon: XCircle,
    line: "border-red-700/40 bg-red-950/20",
    iconBox: "bg-red-900/40 text-red-400 ring-red-700/40",
    label: "Ação necessária",
    labelClass: "bg-red-900/45 text-red-300",
  },
};

export default function DiagnosticoWhatsAppPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    setResults([]);

    try {
      const configResponse = await fetch("/api/admin/diagnostico/config");
      const configData = await configResponse.json();

      setResults([
        {
          name: "Credencial da WasenderAPI",
          status: configData.hasApiKey ? "success" : "error",
          message: configData.hasApiKey ? "Chave de integração configurada" : "Chave de integração não configurada",
          details: configData.hasApiKey
            ? "A credencial foi encontrada de forma segura nas variáveis de ambiente."
            : "Configure WASENDER_API_KEY no ambiente da aplicação.",
        },
        {
          name: "Endpoint de integração",
          status: configData.hasBaseUrl ? "success" : "warning",
          message: configData.baseUrl || "Usando endpoint padrão",
          details: configData.baseUrl || "https://wasenderapi.com/api",
        },
      ]);

      if (configData.hasApiKey) {
        const testResponse = await fetch("/api/admin/diagnostico/test-connection");
        const testData = await testResponse.json();

        setResults((previous) => [
          ...previous,
          {
            name: "Conexão com a WasenderAPI",
            status: testData.success ? "success" : "error",
            message: testData.success ? "Integração respondeu com sucesso" : "Não foi possível concluir a conexão",
            details: testData.message || testData.error,
          },
        ]);

        if (!testData.success && testData.status === 429) {
          setResults((previous) => [
            ...previous,
            {
              name: "Capacidade de envio",
              status: "warning",
              message: "O limite diário da API pode ter sido alcançado",
              details: "No plano de teste, a WasenderAPI limita a 50 mensagens por dia. Aguarde o reset ou faça upgrade do plano.",
            },
          ]);
        } else if (testData.success) {
          setResults((previous) => [
            ...previous,
            {
              name: "Capacidade de envio",
              status: "success",
              message: "Canal disponível para novas mensagens",
              details: "Monitore limites e taxas diretamente no provedor antes de campanhas em massa.",
            },
          ]);
        }
      }

      const settingsResponse = await fetch("/api/admin/diagnostico/settings");
      const settingsData = await settingsResponse.json();

      setResults((previous) => [
        ...previous,
        {
          name: "Operação do WhatsApp",
          status: settingsData.whatsappEnabled ? "success" : "warning",
          message: settingsData.whatsappEnabled ? "Canal oficial habilitado" : "Canal desabilitado nas configurações",
          details: `Modo de teste: ${settingsData.testModeEnabled ? "ativo" : "inativo"}.`,
        },
      ]);
    } catch (error) {
      setResults((previous) => [
        ...previous,
        {
          name: "Execução do diagnóstico",
          status: "error",
          message: "Não foi possível concluir a verificação",
          details: error instanceof Error ? error.message : "Erro inesperado",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runDiagnostics();
  }, []);

  const summary = useMemo(
    () => ({
      ok: results.filter((result) => result.status === "success").length,
      warnings: results.filter((result) => result.status === "warning").length,
      errors: results.filter((result) => result.status === "error").length,
    }),
    [results],
  );

  const operationState =
    summary.errors > 0 ? "Atenção necessária" : summary.warnings > 0 ? "Operando com alertas" : results.length ? "Canal saudável" : "Aguardando leitura";

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Diagnóstico do WhatsApp"
        description="Leitura segura da integração, disponibilidade e configuração do canal."
        actions={
          <button onClick={() => void runDiagnostics()} disabled={loading} className="btn-primary gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? "Verificando" : "Executar diagnóstico"}
          </button>
        }
      />

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-brand-700/35 bg-[radial-gradient(ellipse_at_top_left,_rgba(212,175,55,0.15),_transparent_54%),#1a1a1a] p-6 shadow-gold">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-900/50 ring-1 ring-brand-700/45">
                <Radio className="h-5 w-5 text-brand-300" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-300">Central de saúde do canal</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-100">{operationState}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  A verificação não exibe chaves ou dados sensíveis. Ela confirma apenas se a operação está pronta para atender clientes.
                </p>
              </div>
            </div>
            <ShieldCheck className="hidden h-7 w-7 text-brand-300 sm:block" />
          </div>
          <div className="mt-6 grid grid-cols-3 divide-x divide-brand-700/25 border-y border-brand-700/25 py-4">
            <div className="px-3 first:pl-0">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Operacionais</p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">{summary.ok}</p>
            </div>
            <div className="px-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Alertas</p>
              <p className="mt-1 text-xl font-semibold text-amber-400">{summary.warnings}</p>
            </div>
            <div className="px-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Falhas</p>
              <p className="mt-1 text-xl font-semibold text-red-400">{summary.errors}</p>
            </div>
          </div>
        </div>

        <aside className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 ring-1 ring-sky-700/40">
              <Wrench className="h-5 w-5 text-sky-400" />
            </div>
            <div>
              <h2 className="font-semibold text-brand-100">Rotina recomendada</h2>
              <p className="text-xs text-slate-500">Antes de abrir atendimento</p>
            </div>
          </div>
          <ol className="mt-5 space-y-3 text-sm text-slate-400">
            {[
              "Confirme que o canal está habilitado.",
              "Valide a integração após mudanças de credenciais.",
              "Use o modo de teste antes de campanhas ou ajustes no fluxo.",
            ].map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-700 text-[10px] font-bold text-brand-200">{index + 1}</span>
                <span className="leading-5">{item}</span>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <div>
            <h2 className="font-semibold text-brand-100">Checklist da integração</h2>
            <p className="mt-1 text-sm text-slate-400">Resultados da última execução.</p>
          </div>
          {loading && <span className="inline-flex items-center gap-2 text-xs font-medium text-brand-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Em análise</span>}
        </div>

        {loading && results.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-brand-300" />
          </div>
        ) : results.length ? (
          <div className="divide-y divide-surface-700">
            {results.map((result, index) => {
              const style = statusStyles[result.status];
              const Icon = style.icon;
              return (
                <article key={`${result.name}-${index}`} className="flex flex-col gap-4 px-5 py-5 transition hover:bg-surface-750/40 sm:flex-row sm:items-start">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${style.iconBox}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-100">{result.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.labelClass}`}>{style.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-300">{result.message}</p>
                    {result.details && <p className="mt-2 text-xs leading-5 text-slate-500">{result.details}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <CircleAlert className="h-10 w-10 text-surface-500" />
            <p className="mt-3 text-sm font-medium text-slate-300">Nenhuma leitura disponível</p>
            <p className="mt-1 text-xs text-slate-500">Execute o diagnóstico para conferir a operação.</p>
          </div>
        )}
      </section>
    </div>
  );
}
