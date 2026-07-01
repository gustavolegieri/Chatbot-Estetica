"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Save, Upload, Image as ImageIcon } from "lucide-react";

export default function MarcaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [themeColor, setThemeColor] = useState("#0ea5a4");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
        setMessage(data.error || "Erro ao salvar marca");
      } else {
        setMessage("Marca salva com sucesso");
      }
    } catch {
      setMessage("Erro de conexão ao salvar marca");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <AdminHeader title="Marca / Personalização" description="Logotipo, cor principal e nome fantasia" />

      {message && <div className="mb-4 rounded border bg-emerald-950/20 px-4 py-2 text-emerald-200">{message}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Identidade</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nome fantasia</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="label">Cor principal</label>
              <input type="color" className="w-16 h-10 p-0" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Logotipo</h2>
          <p className="text-sm text-slate-500 mb-4">Envie a imagem que será usada no cabeçalho do painel e no WhatsApp (PNG/JPG).</p>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-3 rounded border border-slate-700/30 px-4 py-2 text-sm text-slate-300 hover:bg-surface-800">
              <Upload className="h-4 w-4" />
              <span>Escolher arquivo</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setLogoFile(e.target.files ? e.target.files[0] : null)}
              />
            </label>
            {preview ? (
              <div className="rounded overflow-hidden border border-slate-700/30">
                <img src={preview} alt="Preview" className="h-20 w-20 object-contain" />
              </div>
            ) : (
              <div className="rounded border border-slate-700/30 p-4 text-slate-500">Nenhuma logo</div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar marca"}
          </button>
        </div>
      </form>
    </div>
  );
}
