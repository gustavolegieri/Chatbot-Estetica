"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Upload, Trash2, Image as ImageIcon, Film, FileType, Loader2 } from "lucide-react";

export default function MidiaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    setSelectedFile(f);
    setFilename(f.name);
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

  const isImage = (mime: string) => mime?.startsWith("image/");

  return (
    <div className="space-y-6">
      <AdminHeader title="Galeria / Mídia" description="Gerencie imagens e arquivos usados no bot" />

      {/* Upload */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
            <Upload className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Enviar arquivo</h2>
            <p className="text-sm text-slate-500">Imagens que o bot pode enviar no WhatsApp</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 transition hover:border-brand-300 hover:bg-brand-50 sm:w-auto sm:px-10">
            <Upload className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">
              {selectedFile ? selectedFile.name : "Clique para escolher"}
            </span>
            <span className="text-xs text-slate-400">PNG, JPG ou MP4</span>
            <input type="file" accept="image/*,video/*" className="hidden" onChange={onSelectFile} />
          </label>

          <div className="flex w-full flex-col gap-3 sm:flex-1">
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="Nome do arquivo"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="ID do serviço (opcional)"
              value={serviceId ?? ''}
              onChange={(e) => setServiceId(e.target.value)}
            />
            <button
              onClick={upload}
              disabled={uploading || !fileDataUrl}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-50"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : <><Upload className="h-4 w-4" /> Enviar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Galeria */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
            <ImageIcon className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Arquivos</h2>
            <p className="text-sm text-slate-500">{files.length} arquivo(s) cadastrado(s)</p>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <ImageIcon className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-sm font-medium">Nenhum arquivo ainda</p>
            <p className="text-xs">Envie imagens para usar no bot do WhatsApp</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => (
              <div key={f.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex h-40 items-center justify-center overflow-hidden bg-slate-100">
                  {isImage(f.mimeType) ? (
                    <img src={f.path} alt={f.filename} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Film className="h-8 w-8" />
                      <span className="text-xs">Vídeo</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-700">{f.filename}</p>
                    <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button
                    onClick={() => removeFile(f.id)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-50 hover:text-red-600"
                  >
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