"use client";

import { useEffect, useState, useRef } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Play, Pause, RotateCcw, Send } from "lucide-react";

export default function CampanhasPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Olá {name}, confira nossas novidades!");
  const [selectorType, setSelectorType] = useState("all");
  const [days, setDays] = useState(30);
  const [serviceId, setServiceId] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
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
      setMessageTone("error");
      setMessageText("Preencha o nome e a mensagem da campanha.");
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
        setMessageTone("error");
        setMessageText(json.error || "Não foi possível criar a campanha.");
      } else {
        setMessageTone("success");
        setMessageText(`Campanha criada com ${json.data.recipients} destinatários.`);
        await loadCampaigns();
      }
    } catch {
      setMessageTone("error");
      setMessageText("Erro de conexão ao criar a campanha.");
    } finally {
      setLoading(false);
    }
  }

  async function startCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setMessageTone("error");
      setMessageText(json.error || "Não foi possível iniciar a campanha.");
      return;
    }
    setMessageTone("success");
    setMessageText("Campanha iniciada.");
    subscribeEvents(id);
    await loadCampaigns();
  }

  async function pauseCampaign(id: string) {
    await fetch(`/api/campanhas/${id}/pause`, { method: "POST" });
    setMessageTone("success");
    setMessageText("Campanha pausada.");
    await loadCampaigns();
  }

  async function resumeCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    const json = await res.json();
    if (res.ok && json.success) {
      setMessageTone("success");
      setMessageText("Campanha retomada.");
      subscribeEvents(id);
      await loadCampaigns();
    }
  }

  function subscribeEvents(id: string) {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/campanhas/${id}/events`);
    es.onmessage = () => {
      void loadCampaigns();
    };
    es.addEventListener("progress", () => {
      void loadCampaigns();
    });
    es.addEventListener("done", () => {
      void loadCampaigns();
      es.close();
      esRef.current = null;
    });
    es.onerror = () => {
      es.close();
      esRef.current = null;
    };
    esRef.current = es;
  }

  return (
    <div>
      <AdminHeader title="Campanhas" description="Monte listas de destinatários e envie mensagens em lote." />

      {messageText && (
        <div className={`mb-4 rounded border px-4 py-2 ${messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {messageText}
        </div>
      )}

      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold">Criar nova campanha</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={selectorType} onChange={(e) => setSelectorType(e.target.value)}>
            <option value="all">Todos os clientes</option>
            <option value="inactive">Inativos há X dias</option>
            <option value="service">Por serviço</option>
          </select>
          {selectorType === "inactive" && <input className="input" type="number" min="1" value={days} onChange={(e) => setDays(Number(e.target.value))} />}
          {selectorType === "service" && <input className="input" placeholder="ID do serviço" value={serviceId} onChange={(e) => setServiceId(e.target.value)} />}
          <textarea className="input h-24 sm:col-span-2" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" onClick={() => void createCampaign()} disabled={loading}>{loading ? "Criando..." : "Criar campanha"}</button>
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="font-semibold mb-3">Histórico de campanhas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-2">Nome</th>
                <th className="py-2">Criada</th>
                <th className="py-2">Total</th>
                <th className="py-2">Sucesso</th>
                <th className="py-2">Falha</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-slate-200">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2">{new Date(c.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="py-2">{c.totalRecipients ?? 0}</td>
                  <td className="py-2">{c.successCount ?? 0}</td>
                  <td className="py-2">{c.failCount ?? 0}</td>
                  <td className="py-2">{c.status}</td>
                  <td className="py-2">
                    {c.status !== "RUNNING" && c.status !== "COMPLETED" && (
                      <button className="btn-secondary flex items-center gap-2" onClick={() => void startCampaign(c.id)}>
                        <Play className="h-3 w-3" /> Iniciar
                      </button>
                    )}
                    {c.status === "RUNNING" && (
                      <button className="btn-secondary flex items-center gap-2" onClick={() => void pauseCampaign(c.id)}>
                        <Pause className="h-3 w-3" /> Pausar
                      </button>
                    )}
                    {c.status === "PAUSED" && (
                      <button className="btn-secondary flex items-center gap-2" onClick={() => void resumeCampaign(c.id)}>
                        <RotateCcw className="h-3 w-3" /> Retomar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
