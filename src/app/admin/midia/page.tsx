"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Upload, Trash2, Image as ImageIcon, Film, Loader2, Info, Play } from "lucide-react";

type Service = {
  id: string;
  name: string;
};

type Media = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  serviceId?: string | null;
};

export default function MidiaPage() {
  const [files, setFiles] = useState<Media[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);

  const [testPhone, setTestPhone] = useState<string>("");
  const [selectedServiceByMedia, setSelectedServiceByMedia] = useState<Record<string, string>>({});
  const [busyByMedia, setBusyByMedia] = useState<Record<string, boolean>>({});

  const servicesById = useMemo(() => {
    const map: Record<string, Service> = {};
    for (const s of services) map[s.id] = s;
    return map;
  }, [services]);

  useEffect(() => {
    void Promise.all([loadMedia(), loadServices()]);
  }, []);

  useEffect(() => {
    // garante que o estado do formulário por mídia não fique vazio após reload
    if (!files?.length) setSelectedServiceByMedia({});
  }, [files]);

  async function loadMedia() {
    const res = await fetch("/api/midia");
    const json = await res.json();
    setFiles(json.data || []);
  }

  async function loadServices() {
    const res = await fetch("/api/servicos?active=true");
    const json = await res.json();
    setServices(json.data || []);
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
    try {
      const res = await fetch("/api/midia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: fileDataUrl, filename }),
      });
      const json = await res.json();
      if (json.error) return;

      setFileDataUrl(null);
      setFilename("");
      setSelectedFile(null);
      await loadMedia();
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    if (!confirm("Remover este arquivo?")) return;
    await fetch(`/api/midia/${id}`, { method: "DELETE" });
    await loadMedia();
  }

  async function validateAndSend(media: Media) {
    const serviceId = selectedServiceByMedia[media.id] || (media.serviceId ?? "");
    if (!serviceId) {
      alert("Selecione um serviço para validar este arquivo.");
      return;
    }
    if (!testPhone || testPhone.trim().length < 5) {
      alert("Informe um telefone válido para teste.");
      return;
    }

    setBusyByMedia((prev) => ({ ...prev, [media.id]: true }));
    try {
      // 1) associa
      await fetch("/api/midia/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, serviceId }),
      });

      // 2) envia teste
      const res = await fetch("/api/midia/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, serviceId, phone: testPhone }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        alert(json.error || "Erro ao enviar teste");
        return;
      }

      alert("Teste enviado! Confira o WhatsApp.");
      await loadMedia();
    } finally {
      setBusyByMedia((prev) => ({ ...prev, [media.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Galeria / Mídia"
        description="Imagens que o robô pode enviar no WhatsApp"
      />

      <div className="rounded-xl border border-brand-700/40 bg-brand-950/30 p-5 shadow-gold">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 mt-0.5 text-brand-400 flex-shrink-0" />
          <div className="text-sm text-slate-300">
            <p className="font-semibold text-brand-200 mb-1">📸 Para que serve esta aba?</p>
            <p>
              Aqui você envia <strong>imagens</strong> (fotos de serviços, antes/depois, logotipos)
              que ficam salvas no sistema.
            </p>
            <p className="mt-2">
              <strong>Validação no fluxo:</strong> ao clicar em <em>Validar no fluxo</em>,
              você escolhe um serviço, associa a mídia e envia uma mensagem de teste.
            </p>
            <p className="mt-1 text-slate-500 text-xs">
              ⚡ Upload sem vincular por ID. A associação é feita na validação.
            </p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
            <Upload className="h-5 w-5 text-brand-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Enviar nova imagem</h2>
            <p className="text-sm text-slate-400">Faça upload de fotos para usar no WhatsApp</p>
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
            <input
              className="input"
              placeholder="Nome do arquivo"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />

            <button
              onClick={upload}
              disabled={uploading || !fileDataUrl}
              className="btn-primary gap-2 justify-center py-3"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Enviar
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Telefone de teste */}
      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
            <Play className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Teste no WhatsApp</h2>
            <p className="text-sm text-slate-400">Informe um telefone para validar as imagens</p>
          </div>
        </div>

        <input
          className="input"
          placeholder="Telefone de teste (ex: +55 11 94059-4405)"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
        />
      </div>

      {/* Galeria */}
      <div className="card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-brand-700/30">
            <ImageIcon className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-brand-200">Suas imagens</h2>
            <p className="text-sm text-slate-400">{files.length} arquivo(s) salvos</p>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <ImageIcon className="mb-3 h-12 w-12 text-slate-600" />
            <p className="text-sm font-medium">Nenhuma imagem ainda</p>
            <p className="text-xs">Envie fotos dos seus serviços para o robô usar</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {files.map((f) => {
              const selectedServiceIdForRow = selectedServiceByMedia[f.id] ?? (f.serviceId ?? "");
              return (
                <div
                  key={f.id}
                  className="group overflow-hidden rounded-xl border border-surface-700 bg-surface-850"
                >
                  <div className="flex h-40 items-center justify-center overflow-hidden bg-surface-800">
                    {f.mimeType?.startsWith("image/") ? (
                      <img
                        src={f.path}
                        alt={f.filename}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <Film className="h-8 w-8" />
                        <span className="text-xs">Vídeo</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-300">{f.filename}</p>
                      <p className="text-[10px] text-slate-500">
                        {(f.size / 1024).toFixed(1)} KB
                        {f.serviceId ? ` · ID: ${String(f.serviceId).slice(0, 8)}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        className="input"
                        value={selectedServiceIdForRow}
                        onChange={(e) =>
                          setSelectedServiceByMedia((prev) => ({
                            ...prev,
                            [f.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione um serviço</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      <button
                        className="btn-secondary h-10 px-3"
                        onClick={() => void validateAndSend(f)}
                        disabled={!!busyByMedia[f.id] || !testPhone}
                        title="Associar e enviar teste"
                      >
                        {busyByMedia[f.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>

                      <button
                        onClick={() => removeFile(f.id)}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-950/40 hover:text-red-300"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

