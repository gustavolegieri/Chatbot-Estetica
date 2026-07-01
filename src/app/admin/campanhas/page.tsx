"use client";

import { useEffect, useState, useRef } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default function CampanhasPage() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Olá {name}, confira nossas novidades!");
  const [selectorType, setSelectorType] = useState("all");
  const [days, setDays] = useState(30);
  const [serviceId, setServiceId] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any>({});
  const esRef = useRef<EventSource | null>(null);

  async function loadCampaigns() {
    const res = await fetch('/api/campanhas');
    const json = await res.json();
    setCampaigns(json.data || []);
  }

  useEffect(() => { loadCampaigns(); }, []);

  async function createCampaign() {
    setLoading(true);
    const selector: any = { type: selectorType };
    if (selectorType === 'inactive') selector.days = days;
    if (selectorType === 'service') selector.serviceId = serviceId;

    const res = await fetch('/api/campanhas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message, selector }) });
    const json = await res.json();
    setLoading(false);
    if (json.error) return alert('Erro');
    await loadCampaigns();
    alert(`Campanha criada: ${json.data.recipients} contatos`);
  }

  async function startCampaign(id: string) {
    const res = await fetch(`/api/campanhas/${id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    if (res.ok) {
      subscribeEvents(id);
      loadCampaigns();
    }
  }

  async function pauseCampaign(id: string) {
    await fetch(`/api/campanhas/${id}/pause`, { method: 'POST' });
    loadCampaigns();
  }

  async function resumeCampaign(id: string) {
    await fetch(`/api/campanhas/${id}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concurrency: 2, delayMs: 3000 }) });
    subscribeEvents(id);
    loadCampaigns();
  }

  function subscribeEvents(id: string) {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(`/api/campanhas/${id}/events`);
    es.onmessage = (ev) => {
      try { const d = JSON.parse(ev.data); setProgress((p:any) => ({ ...p, [id]: (p[id] || 0) + 1 })); } catch {}
    };
    es.addEventListener('progress', (ev: any) => {
      try { const d = JSON.parse(ev.data); setProgress((p:any) => ({ ...p, [id]: (p[id] || 0) + 1 })); } catch {}
    });
    es.addEventListener('done', (ev: any) => { loadCampaigns(); es.close(); esRef.current = null; });
    es.onerror = () => { es.close(); esRef.current = null; };
    esRef.current = es;
  }

  return (
    <div>
      <AdminHeader title="Campanhas e Mensagens" description="Envio em fila para WasenderAPI com paralelismo controlado" />

      <div className="card">
        <h3 className="font-semibold mb-2">Criar nova campanha</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={selectorType} onChange={(e) => setSelectorType(e.target.value)}>
            <option value="all">Todos os clientes</option>
            <option value="inactive">Inativos há X dias</option>
            <option value="service">Por serviço</option>
          </select>
          {selectorType === 'inactive' && <input className="input" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} />}
          {selectorType === 'service' && <input className="input" placeholder="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)} />}
          <textarea className="input h-24" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createCampaign} disabled={loading}>Criar</button>
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="font-semibold mb-3">Histórico de campanhas</h3>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Data</th>
              <th>Total</th>
              <th>Sucesso</th>
              <th>Falha</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
                <td>{c.totalRecipients ?? 0}</td>
                <td>{c.successCount ?? 0}</td>
                <td>{c.failCount ?? 0}</td>
                <td>{c.status}</td>
                <td>
                  {c.status !== 'RUNNING' && <button className="btn-secondary" onClick={() => startCampaign(c.id)}>Start</button>}
                  {c.status === 'RUNNING' && <button className="btn-secondary" onClick={() => pauseCampaign(c.id)}>Pause</button>}
                  {c.status === 'PAUSED' && <button className="btn-secondary" onClick={() => resumeCampaign(c.id)}>Resume</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
