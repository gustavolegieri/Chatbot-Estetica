"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default function MidiaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function uploadMultipart() {
    if (!selectedFile) return alert('Selecione um arquivo');
    setLoading(true);
    const fd = new FormData();
    fd.append('file', selectedFile);
    if (serviceId) fd.append('serviceId', serviceId);
    const res = await fetch('/api/midia/upload', { method: 'POST', body: fd });
    const json = await res.json();
    setLoading(false);
    if (json.error) return alert('Erro');
    setSelectedFile(null);
    setFileDataUrl(null);
    setFilename('');
    await load();
  }

  async function upload() {
    if (!fileDataUrl || !filename) return alert('Selecione um arquivo');
    setLoading(true);
    const res = await fetch('/api/midia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: fileDataUrl, filename, serviceId }) });
    const json = await res.json();
    setLoading(false);
    if (json.error) return alert('Erro');
    setFileDataUrl(null);
    setFilename('');
    await load();
  }

  return (
    <div>
      <AdminHeader title="Galeria / Mídia do Bot" description="Gerencie imagens e arquivos usados pelo bot" />

      <div className="card">
        <h3 className="font-semibold mb-2">Upload</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="file" accept="image/*,video/*" onChange={onSelectFile} />
          <input className="input" placeholder="filename" value={filename} onChange={(e) => setFilename(e.target.value)} />
          <input className="input" placeholder="serviceId (opcional)" value={serviceId ?? ''} onChange={(e) => setServiceId(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={upload} disabled={loading}>Upload (base64)</button>
            <button className="btn-secondary" onClick={uploadMultipart} disabled={loading}>Upload (multipart)</button>
          </div>
        </div>
      </div>

      <div className="mt-6 card">
        <h3 className="font-semibold mb-3">Arquivos</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {files.map((f) => (
            <div key={f.id} className="border p-2">
              <img src={f.path} alt={f.filename} className="h-32 w-full object-cover" />
              <div className="text-xs mt-1 flex items-center justify-between">
                <span>{f.filename}</span>
                <button className="text-red-500 text-xs" onClick={async () => { if (!confirm('Remover?')) return; await fetch(`/api/midia/${f.id}`, { method: 'DELETE' }); await load(); }}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
