"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Save, Upload, Image as ImageIcon, Palette, Store, CheckCircle2, AlertCircle } from "lucide-react";

export default function MarcaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [themeColor, setThemeColor] = useState("#d4af37");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/marca")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setDisplayName(res.data.displayName ?? "");
          setThemeColor(res.data.themeColor ?? "#d4af37");
          if (res.data.logoPath) setPreview(res.data.logoPath);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!logoFile) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.readAsDataURL(logoFile);
  }, [logoFile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: any = { displayName, themeColor };
    if (preview && preview.startsWith("data:")) payload.logoDataUrl = preview;
    try {
      const res = await fetch("/api/marca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) setMessage({ text: data.error || "Erro ao salvar", type: "error" });
      else setMessage({ text: "Marca salva com sucesso! ✅", type: "success" });
    } catch {
      setMessage({ text: "Erro de conexão", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <AdminHeader title="Marca / Personalização" description="Logotipo, cor principal e nome fantasia" />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Marca / Personalização" description="Personalize a aparência do seu painel e WhatsApp" />

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-gold ${
          message.type === "success"
            ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
            : "border-red-700/50 bg-red-950/40 text-red-300"
        }`}>
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertCircle className="h-5 w-5 text-red-400" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identidade Visual */}
        <div className="card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
              <Store className="h-5 w-5 text-brand-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Identidade Visual</h2>
              <p className="text-sm text-slate-400">Dados que aparecem no cabeçalho e no WhatsApp</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="label">Nome do negócio</label>
              <input className="input" placeholder="Ex: Garagem do Ka" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Nome que aparece no topo do painel</p>
            </div>
            <div>
              <label className="label">Cor principal</label>
              <div className="flex items-center gap-3">
                <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="h-12 w-20 cursor-pointer rounded-xl border border-surface-600 bg-surface-850 p-1" />
                <div className="flex items-center gap-2 rounded-xl bg-surface-850 px-4 py-3 ring-1 ring-surface-600">
                  <Palette className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-400">{themeColor}</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">Cor dos destaques e botões</p>
            </div>
          </div>
        </div>

        {/* Logotipo */}
        <div className="card">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-900/40 ring-1 ring-amber-700/30">
              <ImageIcon className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-200">Logotipo</h2>
              <p className="text-sm text-slate-400">Imagem que aparece no cabeçalho (PNG ou JPG)</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-surface-600 bg-surface-850">
              {preview ? (
                <img src={preview} alt="Logo" className="h-full w-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Sem logo</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-700/50 bg-brand-950/30 px-6 py-4 transition hover:border-brand-500/50 hover:bg-brand-950/50">
                <Upload className="h-5 w-5 text-brand-400" />
                <span className="text-sm font-medium text-brand-300">{logoFile ? "Trocar arquivo" : "Clique para escolher uma imagem"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              </label>
              {logoFile && <p className="mt-2 text-center text-xs text-slate-500">Arquivo: {logoFile.name} ({(logoFile.size / 1024).toFixed(1)} KB)</p>}
            </div>
          </div>
        </div>

        {/* Salvar */}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary gap-2 px-8 py-3">
            {saving ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-950 border-t-transparent" /> Salvando...</> : <><Save className="h-4 w-4" /> Salvar alterações</>}
          </button>
        </div>
      </form>
    </div>
  );
}