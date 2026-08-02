"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  MessageCircle,
  RadioTower,
  Send,
  ShieldAlert,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface SendResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: unknown;
}

export default function TestarEnvioPage() {
  const [phone, setPhone] = useState("5511944400696");
  const [message, setMessage] = useState("Olá! Esta é uma mensagem de teste da Garagem do Ka.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/testar-envio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      const data = await response.json();
      setResult({
        success: Boolean(data.success),
        message: data.message || data.error,
        error: data.error,
        details: data.details,
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Erro ao fazer requisição",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Teste de envio direto"
        description="Valide o canal de saída com uma mensagem pontual pela integração Wasender."
        actions={
          <span className="inline-flex items-center gap-2 rounded-lg border border-red-700/35 bg-red-950/20 px-3 py-2 text-xs font-medium text-red-200">
            <RadioTower className="h-4 w-4" />
            Envio real
          </span>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleTest();
          }}
          className="card space-y-5"
        >
          <div className="flex items-start gap-3 border-b border-surface-700 pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/40">
              <MessageCircle className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="font-semibold text-brand-100">Mensagem de verificação</h2>
              <p className="mt-1 text-sm text-slate-400">Este teste não cria uma conversa administrativa no banco.</p>
            </div>
          </div>
          <label>
            <span className="label">Número de destino *</span>
            <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="5511944400696" className="input" required />
            <span className="mt-1.5 block text-xs text-slate-500">Formato: DDI + DDD + número, somente dígitos.</span>
          </label>
          <label>
            <span className="label">Conteúdo da mensagem *</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Digite a mensagem de teste..." rows={6} className="input resize-y" required />
          </label>
          <div className="flex flex-col gap-3 border-t border-surface-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Use apenas números autorizados para teste.</p>
            <button type="submit" disabled={loading} className="btn-primary min-w-52 gap-2">
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-950 border-t-transparent" /> : <Send className="h-4 w-4" />}
              {loading ? "Enviando..." : "Enviar mensagem real"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h2 className="font-semibold text-amber-200">Confirmação de segurança</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/75">
                  A mensagem será realmente entregue via API. Considere os limites diários e não use este recurso para campanhas.
                </p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 text-sky-400 ring-1 ring-sky-700/40"><TerminalSquare className="h-5 w-5" /></div>
              <div><h2 className="font-semibold text-brand-100">Quando usar</h2><p className="text-xs text-slate-500">Diagnóstico do canal</p></div>
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-5 text-slate-400">
              <li>• Após configurar ou trocar a chave da WasenderAPI.</li>
              <li>• Para isolar falhas de entrega do fluxo do bot.</li>
              <li>• Com um número de teste conhecido e autorizado.</li>
            </ul>
          </div>
        </aside>
      </section>

      {result && (
        <section className={result.success ? "rounded-2xl border border-emerald-700/45 bg-emerald-950/25 p-5" : "rounded-2xl border border-red-700/45 bg-red-950/25 p-5"}>
          <div className="flex items-start gap-3">
            <div className={result.success ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900/40 text-emerald-400" : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-900/40 text-red-400"}>
              {result.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className={result.success ? "font-semibold text-emerald-200" : "font-semibold text-red-200"}>{result.success ? "Envio confirmado" : "Envio não concluído"}</h2>
              <p className={result.success ? "mt-1 text-sm text-emerald-100/80" : "mt-1 text-sm text-red-100/80"}>{result.message}</p>
              {result.details !== undefined && <pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-surface-700 bg-surface-900 p-4 text-xs leading-5 text-slate-400">{String(JSON.stringify(result.details, null, 2))}</pre>}
            </div>
          </div>
        </section>
      )}

      {!result && <div className="flex items-center gap-2 text-xs text-slate-500"><CircleAlert className="h-3.5 w-3.5" /> O resultado detalhado da integração aparecerá aqui após o envio.</div>}
    </div>
  );
}
