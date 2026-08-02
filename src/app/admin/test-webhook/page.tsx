"use client";

import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  MessageCircle,
  Radio,
  Send,
  TestTube2,
  Workflow,
  XCircle,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface TestResult {
  success: boolean;
  message?: string;
  error?: string;
  dedup?: boolean;
}

export default function TestWebhookPage() {
  const [phone, setPhone] = useState("5511972851072");
  const [text, setText] = useState("Olá");
  const [buttonId, setButtonId] = useState("");
  const [listId, setListId] = useState("");
  const [pushName, setPushName] = useState("Teste CRM");
  const [messageId, setMessageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          text,
          buttonId: buttonId || undefined,
          listId: listId || undefined,
          pushName,
          messageId: messageId || undefined,
        }),
      });
      const data = await response.json();
      setResult({
        success: Boolean(data.success),
        message: data.message || data.error,
        error: data.error,
        dedup: data.dedup,
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
        title="Simulador de webhook"
        description="Reproduza eventos recebidos pelo WhatsApp para validar o fluxo em um ambiente controlado."
        actions={
          <span className="inline-flex items-center gap-2 rounded-lg border border-brand-700/35 bg-brand-950/25 px-3 py-2 text-xs font-medium text-brand-200">
            <TestTube2 className="h-4 w-4" />
            Ambiente de testes
          </span>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleTest();
          }}
          className="card space-y-5"
        >
          <div className="flex items-start gap-3 border-b border-surface-700 pb-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/40">
              <Radio className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="font-semibold text-brand-100">Evento de entrada</h2>
              <p className="mt-1 text-sm text-slate-400">Os campos abaixo simulam o payload que chega pelo webhook oficial.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="label">Número do cliente *</span>
              <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="5511972851072" className="input" required />
              <span className="mt-1.5 block text-xs text-slate-500">DDI + DDD + número, somente dígitos.</span>
            </label>
            <label>
              <span className="label">Nome exibido</span>
              <input type="text" value={pushName} onChange={(event) => setPushName(event.target.value)} placeholder="Teste CRM" className="input" />
            </label>
          </div>

          <label>
            <span className="label">Mensagem recebida *</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Digite a mensagem como o cliente enviaria..." rows={4} className="input resize-y" required />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label>
              <span className="label">Button ID</span>
              <input type="text" value={buttonId} onChange={(event) => setButtonId(event.target.value)} placeholder="1" className="input" />
            </label>
            <label>
              <span className="label">List ID</span>
              <input type="text" value={listId} onChange={(event) => setListId(event.target.value)} placeholder="service_1" className="input" />
            </label>
            <label>
              <span className="label">Message ID</span>
              <input type="text" value={messageId} onChange={(event) => setMessageId(event.target.value)} placeholder="TESTE-001" className="input" />
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-surface-700 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">Use um Message ID para validar a deduplicação persistente do webhook.</p>
            <button type="submit" disabled={loading} className="btn-primary min-w-48 gap-2">
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-950 border-t-transparent" /> : <Send className="h-4 w-4" />}
              {loading ? "Processando..." : "Simular mensagem"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-5">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <h2 className="font-semibold text-amber-200">Atenção operacional</h2>
                <p className="mt-2 text-sm leading-6 text-amber-100/75">
                  Esta simulação usa o motor real do bot. Dependendo da configuração, ela pode disparar a resposta do fluxo para o número informado.
                </p>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 ring-1 ring-sky-700/40"><Workflow className="h-5 w-5 text-sky-400" /></div>
              <div><h2 className="font-semibold text-brand-100">Cenários úteis</h2><p className="text-xs text-slate-500">Validações rápidas</p></div>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-slate-400">
              <li className="flex gap-3"><span className="text-brand-300">01</span><span><strong className="font-medium text-slate-200">Olá</strong> inicia a jornada de boas-vindas.</span></li>
              <li className="flex gap-3"><span className="text-brand-300">02</span><span><strong className="font-medium text-slate-200">menu</strong> retorna ao menu oficial.</span></li>
              <li className="flex gap-3"><span className="text-brand-300">03</span><span>Repita o mesmo Message ID para testar a deduplicação.</span></li>
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
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className={result.success ? "font-semibold text-emerald-200" : "font-semibold text-red-200"}>{result.success ? "Evento processado" : "Falha no processamento"}</h2>
                {result.dedup && <span className="rounded-full bg-surface-800 px-2 py-0.5 text-[11px] font-semibold text-brand-200">Deduplicado</span>}
              </div>
              <p className={result.success ? "mt-1 text-sm text-emerald-100/80" : "mt-1 text-sm text-red-100/80"}>{result.message}</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
