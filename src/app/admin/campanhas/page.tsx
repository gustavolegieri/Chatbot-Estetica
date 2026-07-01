"use client";

import { useEffect, useState, useRef } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Play, Pause, RotateCcw, Send, Plus, CheckCircle2, AlertCircle, Users, MessageSquare, Clock, BarChart3 } from "lucide-react";

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-700 text-slate-300",
  RUNNING: "bg-emerald-900/60 text-emerald-300 ring-1 ring-emerald-700/50",
  PAUSED: "bg-amber-900/60 text-amber-300 ring-1 ring-amber-700/50",
  COMPLETED: "bg-blue-900/60 text-blue-300 ring-1 ring-blue-700/50",
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
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  async function loadCampaigns() {
    const res = await fetch("/api/campanhas");
    const json = await res.json();
    setCampaigns(json.data || []);
  }

  useEffect(() => { void loadCampaigns(); }, []);

  async function createCampaign() {
    if (!name.trim() || !message.trim()) { setMsg({ text: "Preencha o nome e a mensagem.", type: "error" }); return; }
    setLoading(true); setMsg(null);
    const selector: any = { type: selectorType };
    if (selectorType === "inactive") selector.days = days;
    if (selectorType === "service") selector.serviceId = serviceId;
    try {
      const res = await fetch("/api/campanhas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, message, selector }) });
      const json = await res.json();
      if (!res.ok || !json.success) setMsg({ text: json.error || "Erro ao criar.", type: "error" });
      else {
        setMsg({ text: `✅ Campanha criada com ${json.data.recipients} destinatários!`, type: "success" });
        await loadCampaigns(); setShowForm(false);
        setName(""); setMessage("Olá {name}, confira nossas novidades!"); setSelectorType("all"); setDays(30); setServiceId("");
      }
    } catch { setMsg({ text: "Erro de conexão.", type: "error" }); }
    finally { setLoading(false); }
  }

  async function startCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (!res.ok || !json.success) { setMsg({ text: json.error || "Erro ao iniciar.", type: "error" }); return; }
    setMsg({ text: "🚀 Campanha iniciada!", type: "success" });
    subscribeEvents(id); await loadCampaigns();
  }

  async function pauseCampaign(id: string) {
    await fetch(`/api/campanhas/${id}/pause`, { method: "POST" });
    setMsg({ text: "⏸️ Pausada.", type: "success" }); await loadCampaigns();
  }

  async function resumeCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (res.ok && json.success) { setMsg({ text: "▶️ Retomada!", type: "success" }); subscribeEvents(id); await loadCampaigns(); }
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

      {msg && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-gold ${
          msg.type === "success" ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300" : "border-red-700/50 bg-red-950/40 text-red-300"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-red-400" />}
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <Send className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total de campanhas</p>
              <p className="text-2xl font-bold text-brand-200">{campaigns.length}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/40 ring-1 ring-emerald-700/30">
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Destinatários</p>
              <p className="text-2xl font-bold text-brand-200">{totalRecipients}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900/40 ring-1 ring-blue-700/30">
              <CheckCircle2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Enviadas</p>
              <p className="text-2xl font-bold text-brand-200">{totalSent}</p>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setShowForm(!showForm)} className="btn-primary gap-2 px-6 py-3">
        <Plus className="h-4 w-4" /> {showForm ? "Fechar" : "Nova campanha"}
      </button>

      {showForm && (
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <MessageSquare className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Criar nova campanha</h2>
              <p className="text-sm text-slate-400">Defina o público e a mensagem</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nome da campanha</label>
              <input className="input" placeholder="Ex: Promoção de julho" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Público-alvo</label>
              <select className="input" value={selectorType} onChange={(e) => setSelectorType(e.target.value)}>
                <option value="all">Todos os clientes</option>
                <option value="inactive">Clientes inativos</option>
                <option value="service">Por serviço</option>
              </select>
            </div>
            {selectorType === "inactive" && (
              <div>
                <label className="label">Inativos há quantos dias?</label>
                <input className="input" type="number" min="1" value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </div>
            )}
            {selectorType === "service" && (
              <div>
                <label className="label">ID do serviço</label>
                <input className="input" placeholder="Ex: serv_abc123" value={serviceId} onChange={(e) => setServiceId(e.target.value)} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Mensagem</label>
              <p className="mb-2 text-xs text-slate-500">Use <code className="rounded bg-surface-700 px-1.5 py-0.5 text-xs font-mono text-brand-300">{`{name}`}</code> para incluir o nome</p>
              <textarea className="input h-28" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button className="btn-primary gap-2 px-6 py-3" onClick={() => void createCampaign()} disabled={loading}>
                {loading ? <><Clock className="h-4 w-4 animate-spin" /> Criando...</> : <><Send className="h-4 w-4" /> Criar campanha</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
            <BarChart3 className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Histórico de campanhas</h2>
            <p className="text-sm text-slate-400">Todas as campanhas criadas</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Send className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhuma campanha ainda</p>
            <p className="text-xs">Clique em &quot;Nova campanha&quot; para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-900/40 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 pr-4">Nome</th>
                  <th className="py-3 pr-4">Criada em</th>
                  <th className="py-3 pr-4 text-center">Total</th>
                  <th className="py-3 pr-4 text-center">✅</th>
                  <th className="py-3 pr-4 text-center">❌</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-surface-700/80 transition hover:bg-surface-750/40">
                    <td className="py-3 pr-4 font-medium text-slate-200">{c.name}</td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(c.createdAt).toLocaleString("pt-BR")}</td>
                    <td className="py-3 pr-4 text-center font-semibold text-slate-200">{c.totalRecipients ?? 0}</td>
                    <td className="py-3 pr-4 text-center text-emerald-400 font-semibold">{c.successCount ?? 0}</td>
                    <td className="py-3 pr-4 text-center text-red-400 font-semibold">{c.failCount ?? 0}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusColors[c.status] || "bg-surface-700 text-slate-400"}`}>
                        {statusLabels[c.status] || c.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {c.status !== "RUNNING" && c.status !== "COMPLETED" && (
                        <button className="btn-secondary gap-1.5 px-3 py-2 text-xs" onClick={() => void startCampaign(c.id)}>
                          <Play className="h-3.5 w-3.5" /> Iniciar
                        </button>
                      )}
                      {c.status === "RUNNING" && (
                        <button className="btn-secondary gap-1.5 px-3 py-2 text-xs" onClick={() => void pauseCampaign(c.id)}>
                          <Pause className="h-3.5 w-3.5" /> Pausar
                        </button>
                      )}
                      {c.status === "PAUSED" && (
                        <button className="btn-secondary gap-1.5 px-3 py-2 text-xs" onClick={() => void resumeCampaign(c.id)}>
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