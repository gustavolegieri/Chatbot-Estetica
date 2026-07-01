"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, Upload, ShieldCheck } from "lucide-react";

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  async function handleDownload() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessageTone("error");
        setMessage(data.error || "Erro ao gerar backup");
        return;
      }

      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-estetica-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessageTone("success");
      setMessage(`Backup gerado com ${data.meta?.counts ? Object.values(data.meta.counts).reduce((sum: number, value: any) => sum + Number(value || 0), 0) : 0} registros.`);
    } catch {
      setMessageTone("error");
      setMessage("Erro de conexão ao gerar backup");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(file: File | null) {
    if (!file) return;
    if (!confirm("Este processo substituirá dados existentes. Deseja continuar?")) return;
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
        setMessageTone("error");
        setMessage(data.error || "Erro ao importar backup");
      } else {
        setMessageTone("success");
        setMessage(`Backup importado com sucesso: ${Object.entries(data.data?.restored || {}).map(([key, value]) => `${key}=${value}`).join(", ")}`);
      }
    } catch (e) {
      console.error(e);
      setMessageTone("error");
      setMessage("Erro ao ler arquivo de backup");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AdminHeader title="Backup" description="Exporte um snapshot do sistema ou restaure um arquivo salvo anteriormente." />

      {message && (
        <div className={`mb-4 rounded border px-4 py-2 ${messageTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="mb-2 flex items-center gap-2">
            <Download className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold">Exportar backup</h3>
          </div>
          <p className="mb-4 text-sm text-slate-500">Baixe um arquivo JSON com clientes, agendamentos, serviços, configurações e cupons.</p>
          <button onClick={() => void handleDownload()} className="btn-primary" disabled={loading}>
            <Download className="mr-2 h-4 w-4" /> {loading ? "Gerando..." : "Baixar backup"}
          </button>
        </div>

        <div className="card">
          <div className="mb-2 flex items-center gap-2">
            <Upload className="h-4 w-4 text-sky-600" />
            <h3 className="font-semibold">Importar backup</h3>
          </div>
          <p className="mb-4 text-sm text-slate-500">Selecione um JSON previamente exportado para restaurar o conteúdo do painel.</p>
          <label className="flex cursor-pointer flex-col gap-2 rounded border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Arquivo JSON</span>
            <input type="file" accept="application/json" className="hidden" onChange={(e) => handleImport(e.target.files ? e.target.files[0] : null)} />
          </label>
        </div>
      </div>
    </div>
  );
}
