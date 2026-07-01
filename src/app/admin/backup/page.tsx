"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Download, Upload } from "lucide-react";

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok) {
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
      setMessage("Backup gerado e iniciado download.");
    } catch {
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
      if (!res.ok) setMessage(data.error || "Erro ao importar backup");
      else setMessage("Backup importado com sucesso.");
    } catch (e) {
      console.error(e);
      setMessage("Erro ao ler arquivo de backup");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AdminHeader title="Backup" description="Exportar e restaurar dados principais do painel" />

      {message && <div className="mb-4 rounded border bg-amber-50 px-4 py-2 text-amber-900">{message}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="mb-2 font-semibold">Exportar backup</h3>
          <p className="text-sm text-slate-500 mb-4">Baixe um arquivo JSON com os dados principais do sistema.</p>
          <button onClick={handleDownload} className="btn-primary">
            <Download className="mr-2 h-4 w-4" /> {loading ? "Gerando..." : "Baixar backup"}
          </button>
        </div>

        <div className="card">
          <h3 className="mb-2 font-semibold">Importar backup</h3>
          <p className="text-sm text-slate-500 mb-4">Envie um JSON gerado por este painel para restaurar dados.</p>
          <input type="file" accept="application/json" onChange={(e) => handleImport(e.target.files ? e.target.files[0] : null)} />
        </div>
      </div>
    </div>
  );
}
