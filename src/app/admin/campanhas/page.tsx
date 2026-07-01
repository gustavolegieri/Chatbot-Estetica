"use client";

import { useEffect, useState, useRef } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Play, Pause, RotateCcw, Send, Plus, CheckCircle2, AlertCircle, Users, MessageSquare, Clock, BarChart3 } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  RUNNING: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  RUNNING: "Enviando...",
  PAUSED: "Pausado",
  COMPLETED: "Concluído",
};

export default function CampanhasPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Olá {name}, confira nossas novidades!");
  const [selectorType, setSelectorType] = useState("all");
  const [days, setDays] = useState(30);
  const [serviceId, setServiceId] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  async function loadCampaigns() {
    const res = await fetch("/api/campanhas");
    const json = await res.json();
    setCampaigns(json.data || []);
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  async function createCampaign() {
    if (!name.trim() || !message.trim()) {
      setMessageText({ text: "Preencha o nome e a mensagem da campanha.", type: "error" });
      return;
    }
    setLoading(true);
    setMessageText(null);
    const selector: any = { type: selectorType };
    if (selectorType === "inactive") selector.days = days;
    if (selectorType === "service") selector.serviceId = serviceId;

    try {
      const res = await fetch("/api/campanhas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, message, selector }) });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessageText({ text: json.error || "Não foi possível criar a campanha.", type: "error" });
      } else {
        setMessageText({ text: `✅ Campanha criada com ${json.data.recipients} destinatários!`, type: "success" });
        await loadCampaigns();
        setShowForm(false);
        setName(""); setMessage("Olá {name}, confira nossas novidades!"); setSelectorType("all"); setDays(30); setServiceId("");
      }
    } catch {
      setMessageText({ text: "Erro de conexão ao criar a campanha.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function startCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setMessageText({ text: json.error || "Não foi possível iniciar a campanha.", type: "error" });
      return;
    }
    setMessageText({ text: "🚀 Campanha iniciada!", type: "success" });
    subscribeEvents(id);
    await loadCampaigns();
  }

  async function pauseCampaign(id: string) {
    await fetch(`/api/campanhas/${id}/pause`, { method: "POST" });
    setMessageText({ text: "⏸️ Campanha pausada.", type: "success" });
    await loadCampaigns();
  }

  async function resumeCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (res.ok && json.success) {
      setMessageText({ text: "▶️ Campanha retomada!", type: "success" });
      subscribeEvents(id);
      await loadCampaigns();
    }
  }

  function subscribeEvents(id: string) {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    const es = new EventSource(`/api/campanhas/${id}/events`);
    es.onmessage = () => { void loadCampaigns(); };
    es.addEventListener("progress", () => { void loadCampaigns(); });
    es.addEventListener("done", () => { void loadCampaigns(); es.close(); esRef.current = null; });
    es.onerror = () => { es.close(); esRef.current = null; };
    esRef.current = es;
  }

  const totalRecipients = campaigns.reduce((acc, c) => acc + (c.totalRecipients ?? 0), 0);
  const totalSent = campaigns.reduce((acc, c) => acc + (c.successCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <AdminHeader title="Campanhas" description="Envie mensagens em lote para seus clientes" />

      {messageText && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg ${
          messageText.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {messageText.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          <span className="text-sm font-medium">{messageText.text}</span>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Send className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total de campanhas</p>
              <p className="text-2xl font-bold text-slate-800">{campaigns.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total de destinatários</p>
              <p className="text-2xl font-bold text-slate-800">{totalRecipients}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <CheckCircle2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Mensagens enviadas</p>
              <p className="text-2xl font-bold text-slate-800">{totalSent}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botão criar */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600"
      >
        <Plus className="h-4 w-4" />
        {showForm ? "Fechar formulário" : "Nova campanha"}
      </button>

      {/* Formulário de criação */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <MessageSquare className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Criar nova campanha</h2>
              <p className="text-sm text-slate-500">Defina o público e a mensagem</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nome da campanha</label>
              <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="Ex: Promoção de julho" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Público-alvo</label>
              <select className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" value={selectorType} onChange={(e) => setSelectorType(e.target.value)}>
                <option value="all">Todos os clientes</option>
                <option value="inactive">Clientes inativos</option>
                <option value="service">Quem contratou um serviço</option>
              </select>
            </div>
            {selectorType === "inactive" && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Inativos há quantos dias?</label>
                <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" type="number" min="1" value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            )}
            {selectorType === "service" && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">ID do serviço</label>
                <input className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="Ex: serv_abc123" value={serviceId} onChange={(e) => setServiceId(e.target.value)} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Mensagem</label>
              <p className="mb-2 text-xs text-slate-400">Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">{`{name}`}</code> para incluir o nome do cliente</p>
              <textarea className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 h-28" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-50" onClick={() => void createCampaign()} disabled={loading}>
                {loading ? <><Clock className="h-4 w-4 animate-spin" /> Criando...</> : <><Send className="h-4 w-4" /> Criar campanha</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <BarChart3 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Histórico de campanhas</h2>
            <p className="text-sm text-slate-500">Todas as campanhas criadas</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Send className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium">Nenhuma campanha ainda</p>
            <p className="text-xs">Clique em &quot;Nova campanha&quot; para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 pr-4">Nome</th>
                  <th className="py-3 pr-4">Criada em</th>
                  <th className="py-3 pr-4 text-center">Total</th>
                  <th className="py-3 pr-4 text-center">✅ Enviadas</th>
                  <th className="py-3 pr-4 text-center">❌ Falhas</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium text-slate-800">{c.name}</td>
                    <td className="py-3 pr-4 text-slate-500">{new Date(c.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="py-3 pr-4 text-center font-semibold">{c.totalRecipients ?? 0}</td>
                    <td className="py-3 pr-4 text-center text-emerald-600 font-semibold">{c.successCount ?? 0}</td>
                    <td className="py-3 pr-4 text-center text-red-500 font-semibold">{c.failCount ?? 0}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusColors[c.status] || "bg-slate-100 text-slate-600"}`}>
                        {statusLabels[c.status] || c.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {c.status !== "RUNNING" && c.status !== "COMPLETED" && (
                        <button className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100" onClick={() => void startCampaign(c.id)}>
                          <Play className="h-3.5 w-3.5" /> Iniciar
                        </button>
                      )}
                      {c.status === "RUNNING" && (
                        <button className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100" onClick={() => void pauseCampaign(c.id)}>
                          <Pause className="h-3.5 w-3.5" /> Pausar
                        </button>
                      )}
                      {c.status === "PAUSED" && (
                        <button className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100" onClick={() => void resumeCampaign(c.id)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Retomar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}