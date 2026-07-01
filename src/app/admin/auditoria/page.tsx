"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { ScrollText, RefreshCw, Search, Clock, User, FileText } from "lucide-react";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/auditoria?limit=200');
    const json = await res.json();
    setLoading(false);
    if (json.success) setLogs(json.data || []);
  }

  const filtered = logs.filter((l) => !search || l.action?.toLowerCase().includes(search.toLowerCase()) || l.resource?.toLowerCase().includes(search.toLowerCase()) || l.userId?.toLowerCase().includes(search.toLowerCase()));

  const actionLabels: Record<string, string> = { create_coupon: "Criou cupom", delete_coupon: "Removeu cupom", update_coupon: "Editou cupom" };

  return (
    <div className="space-y-6">
      <AdminHeader title="Log de Auditoria" description="Histórico de ações administrativas"
        actions={
          <button onClick={load} disabled={loading} className="btn-secondary gap-2 px-4 py-2.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        }
      />

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="w-full rounded-2xl border border-surface-600 bg-surface-850 px-11 py-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" placeholder="Buscar por ação, recurso ou usuário..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-2xl border border-surface-700 bg-surface-800 shadow-gold">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <ScrollText className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhum registro encontrado</p>
            <p className="text-xs">{search ? "Tente outro termo" : "Nenhuma ação registrada ainda"}</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-700">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-start gap-4 px-6 py-4 transition hover:bg-surface-750/40">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-700">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">{actionLabels[l.action] || l.action}</span>
                    <span className="text-xs text-slate-600">•</span>
                    <span className="text-xs text-slate-400 font-mono">{l.resource?.slice(0, 20)}</span>
                  </div>
                  {l.data && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Ver detalhes</summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-850 p-3 text-[11px] text-slate-400">{JSON.stringify(l.data, null, 2)}</pre>
                    </details>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                    {l.userId && <span className="flex items-center gap-1"><User className="h-3 w-3" />{l.userId}</span>}
                    {l.ip && <span className="text-[10px] text-slate-600">IP: {l.ip}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}