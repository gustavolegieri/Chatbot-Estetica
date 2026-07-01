"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Save, Upload, Image as ImageIcon, Palette, Store, CheckCircle2, AlertCircle } from "lucide-react";

export default function MarcaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [themeColor, setThemeColor] = useState("#0ea5a4");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/marca")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setDisplayName(res.data.displayName ?? "");
          setThemeColor(res.data.themeColor ?? "#0ea5a4");
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
      if (!res.ok) {
        setMessage({ text: data.error || "Erro ao salvar marca", type: "error" });
      } else {
        setMessage({ text: "Marca salva com sucesso! ✅", type: "success" });
      }
    } catch {
      setMessage({ text: "Erro de conexão ao salvar marca", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <AdminHeader title="Marca / Personalização" description="Logotipo, cor principal e nome fantasia" />
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            <span>Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Marca / Personalização" description="Personalize a aparência do seu painel e WhatsApp" />

      {/* Toast de notificação */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-4 shadow-lg ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-500" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Card: Identidade Visual */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <Store className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Identidade Visual</h2>
              <p className="text-sm text-slate-500">Dados que aparecem no cabeçalho e no WhatsApp</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nome do negócio
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                placeholder="Ex: Garagem do Ka"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">Nome que aparece no topo do painel</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Cor principal
              </label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="h-12 w-20 cursor-pointer rounded-xl border border-slate-300 p-1"
                  />
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
                  <Palette className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-mono text-slate-600">{themeColor}</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-400">Cor dos destaques e botões</p>
            </div>
          </div>
        </div>

        {/* Card: Logotipo */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <ImageIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Logotipo</h2>
              <p className="text-sm text-slate-500">Imagem que aparece no cabeçalho (PNG ou JPG)</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 sm:flex-row">
            {/* Preview da logo */}
            <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
              {preview ? (
                <img src={preview} alt="Logo" className="h-full w-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Sem logo</span>
                </div>
              )}
            </div>

            <div className="flex-1">
              <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-6 py-4 transition hover:bg-brand-100">
                <Upload className="h-5 w-5 text-brand-500" />
                <span className="text-sm font-medium text-brand-700">
                  {logoFile ? "Trocar arquivo" : "Clique para escolher uma imagem"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setLogoFile(e.target.files ? e.target.files[0] : null)}
                />
              </label>
              {logoFile && (
                <p className="mt-2 text-center text-xs text-slate-500">
                  Arquivo: {logoFile.name} ({(logoFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar alterações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}