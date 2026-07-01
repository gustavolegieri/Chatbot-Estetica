"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, Upload, ShieldCheck, AlertTriangle, CheckCircle2, AlertCircle, Database, RefreshCw } from "lucide-react";

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleDownload() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ text: data.error || "Erro ao gerar backup", type: "error" });
        return;
      }

      const total = data.meta?.counts ? Object.values(data.meta.counts).reduce((sum: number, value: any) => sum + Number(value || 0), 0) : 0;
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-estetica-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: `✅ Backup baixado com ${total} registros!`, type: "success" });
    } catch {
      setMessage({ text: "Erro de conexão ao gerar backup", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    if (!confirm("⚠️ Isso substituirá TODOS os dados atuais pelos do arquivo. Deseja continuar?")) return;
    setLoading(true);
    setMessage(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, data: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ text: data.error || "Erro ao importar backup", type: "error" });
      } else {
        const restored = Object.entries(data.data?.restored || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
        setMessage({ text: `✅ Backup restaurado: ${restored}`, type: "success" });
      }
    } catch {
      setMessage({ text: "Erro ao ler o arquivo de backup. Verifique se é um JSON válido.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Backup" description="Exporte ou restaure todos os dados do sistema" />

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg ${
          message.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Exportar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <Download className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Exportar backup</h2>
              <p className="text-sm text-slate-500">Baixe um arquivo com todos os dados</p>
            </div>
          </div>

          <div className="mb-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wider">Inclui</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <span>• Clientes</span>
              <span>• Agendamentos</span>
              <span>• Serviços</span>
              <span>• Prompts do bot</span>
              <span>• Configurações</span>
              <span>• Cupons</span>
            </div>
          </div>

          <button
            onClick={() => void handleDownload()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <><Download className="h-4 w-4" /> Baixar backup</>
            )}
          </button>
        </div>

        {/* Importar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
              <Upload className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Restaurar backup</h2>
              <p className="text-sm text-slate-500">Substitui os dados atuais por um arquivo salvo</p>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700">
              <strong>Atenção:</strong> restaurar um backup apaga todos os dados atuais e substitui pelo arquivo. Esta ação não pode ser desfeita.
            </p>
          </div>

          <label className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 transition hover:border-amber-300 hover:bg-amber-50">
            <ShieldCheck className="h-8 w-8 text-slate-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600">Clique para selecionar um arquivo</p>
              <p className="text-xs text-slate-400">Arquivo JSON (.json)</p>
            </div>
            <input type="file" accept="application/json" className="hidden" onChange={(e) => handleImport(e.target.files ? e.target.files[0] : null)} />
          </label>
        </div>
      </div>
    </div>
  );
}