"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Upload, Trash2, Image as ImageIcon, Film, Loader2 } from "lucide-react";

export default function MidiaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch('/api/midia');
    const json = await res.json();
    setFiles(json.data || []);
  }

  function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile(f); setFilename(f.name);
    const reader = new FileReader();
    reader.onload = () => setFileDataUrl(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function upload() {
    if (!fileDataUrl || !filename) return;
    setUploading(true);
    const res = await fetch('/api/midia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: fileDataUrl, filename, serviceId }) });
    const json = await res.json();
    setUploading(false);
    if (json.error) return;
    setFileDataUrl(null); setFilename(''); setSelectedFile(null);
    await load();
  }

  async function removeFile(id: string) {
    if (!confirm('Remover este arquivo?')) return;
    await fetch(`/api/midia/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Galeria / Mídia" description="Gerencie imagens e arquivos usados no bot" />

      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
            <Upload className="h-5 w-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Enviar arquivo</h2>
            <p className="text-sm text-slate-400">Imagens que o bot pode enviar no WhatsApp</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-600 bg-surface-850 px-6 py-8 transition hover:border-brand-700/50 hover:bg-brand-950/30 sm:w-auto sm:px-10">
            <Upload className="h-8 w-8 text-slate-500" />
            <span className="text-sm font-medium text-slate-400">{selectedFile ? selectedFile.name : "Clique para escolher"}</span>
            <span className="text-xs text-slate-600">PNG, JPG ou MP4</span>
            <input type="file" accept="image/*,video/*" className="hidden" onChange={onSelectFile} />
          </label>

          <div className="flex w-full flex-col gap-3 sm:flex-1">
            <input className="input" placeholder="Nome do arquivo" value={filename} onChange={(e) => setFilename(e.target.value)} />
            <input className="input" placeholder="ID do serviço (opcional)" value={serviceId ?? ''} onChange={(e) => setServiceId(e.target.value)} />
            <button onClick={upload} disabled={uploading || !fileDataUrl} className="btn-primary gap-2 justify-center py-3">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><Upload className="h-4 w-4" /> Enviar</>}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
            <ImageIcon className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Arquivos</h2>
            <p className="text-sm text-slate-400">{files.length} arquivo(s) cadastrado(s)</p>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <ImageIcon className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhum arquivo ainda</p>
            <p className="text-xs">Envie imagens para usar no bot do WhatsApp</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <div key={f.id} className="group overflow-hidden rounded-xl border border-surface-700 bg-surface-850">
                <div className="flex h-40 items-center justify-center overflow-hidden bg-surface-800">
                  {f.mimeType?.startsWith("image/") ? (
                    <img src={f.path} alt={f.filename} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-500"><Film className="h-8 w-8" /><span className="text-xs">Vídeo</span></div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-300">{f.filename}</p>
                    <p className="text-[10px] text-slate-500">{(f.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={() => removeFile(f.id)} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-950/40 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}