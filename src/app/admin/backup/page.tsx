"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, Upload, ShieldCheck, AlertTriangle, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleDownload() {
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok || !data.success) { setMsg({ text: data.error || "Erro ao gerar backup", type: "error" }); return; }
      const total = data.meta?.counts ? Object.values(data.meta.counts).reduce((sum: number, value: any) => sum + Number(value || 0), 0) : 0;
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `backup-estetica-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      setMsg({ text: `✅ Backup baixado com ${total} registros!`, type: "success" });
    } catch { setMsg({ text: "Erro de conexão.", type: "error" }); }
    finally { setLoading(false); }
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    if (!confirm("⚠️ Isso substituirá TODOS os dados atuais. Continuar?")) return;
    setLoading(true); setMsg(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, data: payload }) });
      const data = await res.json();
      if (!res.ok || !data.success) setMsg({ text: data.error || "Erro ao importar", type: "error" });
      else {
        const restored = Object.entries(data.data?.restored || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        setMsg({ text: `✅ Backup restaurado: ${restored}`, type: "success" });
      }
    } catch { setMsg({ text: "Arquivo inválido. Verifique se é um JSON.", type: "error" }); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Backup" description="Exporte ou restaure todos os dados do sistema" />

      {msg && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-gold ${
          msg.type === "success" ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300" : "border-red-700/50 bg-red-950/40 text-red-300"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-red-400" />}
          <span className="text-sm font-medium">{msg.text}</span>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Exportar */}
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/40 ring-1 ring-emerald-700/30">
              <Download className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Exportar backup</h2>
              <p className="text-sm text-slate-400">Baixe um arquivo com todos os dados</p>
            </div>
          </div>

          <div className="mb-5 rounded-xl bg-surface-850 p-4 ring-1 ring-surface-600">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Inclui</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-400">
              <span>• Clientes</span><span>• Agendamentos</span>
              <span>• Serviços</span><span>• Prompts do bot</span>
              <span>• Configurações</span><span>• Cupons</span>
            </div>
          </div>

          <button onClick={() => void handleDownload()} disabled={loading} className="btn-primary w-full justify-center gap-2 py-3.5">
            {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</> : <><Download className="h-4 w-4" /> Baixar backup</>}
          </button>
        </div>

        {/* Importar */}
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
              <Upload className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Restaurar backup</h2>
              <p className="text-sm text-slate-400">Substitui os dados atuais por um arquivo salvo</p>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-700/40 bg-amber-950/30 p-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-400" />
            <p className="text-xs text-amber-300"><strong>Atenção:</strong> restaurar um backup apaga todos os dados atuais. Esta ação não pode ser desfeita.</p>
          </div>

          <label className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-surface-600 bg-surface-850 px-6 py-8 transition hover:border-amber-700/50 hover:bg-amber-950/20">
            <ShieldCheck className="h-8 w-8 text-slate-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">Clique para selecionar</p>
              <p className="text-xs text-slate-600">Arquivo JSON (.json)</p>
            </div>
            <input type="file" accept="application/json" className="hidden" onChange={(e) => handleImport(e.target.files?.[0] ?? null)} />
          </label>
        </div>
      </div>
    </div>
  );
}