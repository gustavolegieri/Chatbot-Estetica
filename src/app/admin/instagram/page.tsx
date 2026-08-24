"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AdminHeader } from "@/components/layout/AdminHeader";
import {
  AlertCircle,
  CheckCircle2,
  Instagram,
  Eye,
  Save,
  Send,
  Trash2,
  Upload,
  RefreshCw,
  Sparkles,
  Lightbulb,
  Camera,
  MessageCircleQuestion,
} from "lucide-react";

type Settings = {
  enabled: boolean;
  publishTimes: string;
  rotationCategories: string;
  blockRepeatDays: number;
  vacantSlotsCampaign: boolean;
  ctaText: string;
  lastRunAt?: string | null;
  lastError?: string | null;
};

type Asset = {
  id: string;
  type: string;
  category: string;
  title: string | null;
  caption: string | null;
  imageUrl: string;
  imageUrlAfter: string | null;
  active: boolean;
  timesUsed: number;
};

type Post = {
  id: string;
  slot: string;
  contentType: string;
  title: string;
  status: string;
  error: string | null;
  reach: number | null;
  impressions: number | null;
  imageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
};

const defaultSettings: Settings = {
  enabled: false,
  publishTimes: "09:00,14:00,19:00",
  rotationCategories: "curiosidade,dica,bastidor,enquete,lavagem,polimento,higienizacao,promocao,antes_depois,agenda_vaga",
  blockRepeatDays: 7,
  vacantSlotsCampaign: true,
  ctaText: "Agende pelo WhatsApp",
};

const contentOptions = [
  { key: "curiosidade", label: "Curiosidades", icon: Lightbulb, tone: "text-amber-300" },
  { key: "dica", label: "Dicas úteis", icon: Sparkles, tone: "text-sky-300" },
  { key: "bastidor", label: "Bastidores", icon: Camera, tone: "text-violet-300" },
  { key: "enquete", label: "Perguntas", icon: MessageCircleQuestion, tone: "text-emerald-300" },
  { key: "lavagem", label: "Lavagem", icon: Sparkles, tone: "text-cyan-300" },
  { key: "polimento", label: "Polimento", icon: Sparkles, tone: "text-yellow-300" },
  { key: "higienizacao", label: "Higienização", icon: Sparkles, tone: "text-orange-300" },
  { key: "promocao", label: "Ofertas", icon: Sparkles, tone: "text-pink-300" },
  { key: "antes_depois", label: "Antes e depois", icon: Camera, tone: "text-brand-300" },
  { key: "agenda_vaga", label: "Agenda vaga", icon: Sparkles, tone: "text-red-300" },
] as const;

const storyExamples = [
  { src: "/story-examples/story-curiosidade.jpg", label: "Curiosidade" },
  { src: "/story-examples/story-dica.jpg", label: "Dica" },
  { src: "/story-examples/story-bastidor.jpg", label: "Bastidor" },
  { src: "/story-examples/story-enquete.jpg", label: "Interação" },
  { src: "/story-examples/story-oferta.jpg", label: "Oferta" },
] as const;

export default function InstagramAutomaticoPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [configured, setConfigured] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [history, setHistory] = useState<Post[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<string>("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [slot, setSlot] = useState<"manha" | "tarde" | "noite">("manha");

  const [assetType, setAssetType] = useState("before_after");
  const [assetCategory, setAssetCategory] = useState("geral");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetCaption, setAssetCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileAfter, setFileAfter] = useState<File | null>(null);

  function toggleContentCategory(key: string) {
    const active = settings.rotationCategories.split(",").map((item) => item.trim()).filter(Boolean);
    const next = active.includes(key) ? active.filter((item) => item !== key) : [...active, key];
    setSettings((current) => ({ ...current, rotationCategories: next.join(",") }));
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/instagram-automation?preview=1&preview_slot=" + slot);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Falha ao carregar");
    setSettings({ ...defaultSettings, ...data.data.settings });
    setConfigured(Boolean(data.data.configured));
    setAssets(data.data.assets || []);
    setHistory(data.data.history || []);
    if (data.data.preview && !data.data.preview.error) {
      setPreviewMeta(
        `${data.data.preview.eyebrow || ""} · ${data.data.preview.title || ""}`.replace(/\n/g, " ")
      );
    }
  }, [slot]);

  useEffect(() => {
    let mounted = true;
    load()
      .catch((e) => mounted && setMessage({ text: e.message, type: "error" }))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/instagram-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data.success) setMessage({ text: data.error || "Erro ao salvar", type: "error" });
      else setMessage({ text: "Configurações salvas.", type: "success" });
    } catch {
      setMessage({ text: "Erro de conexão", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/instagram-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", slot }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha no preview");
      setPreviewUrl(data.data.imageUrl);
      setPreviewMeta(`${data.data.selected?.category} · ${data.data.content?.title}`.replace(/\n/g, " "));
      setMessage({ text: "Pré-visualização gerada no próprio sistema.", type: "success" });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Erro", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(dryRun: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/instagram-automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish_now", slot, dry_run: dryRun }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha ao publicar");
      if (data.data.imageUrl) setPreviewUrl(data.data.imageUrl);
      setMessage({
        text: dryRun ? "Dry-run ok (não publicou no Instagram)." : "Story publicado no Instagram.",
        type: "success",
      });
      await load();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Erro", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage({ text: "Selecione uma imagem.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (fileAfter) form.set("fileAfter", fileAfter);
      form.set("type", assetType);
      form.set("category", assetCategory);
      form.set("title", assetTitle);
      form.set("caption", assetCaption);
      const res = await fetch("/api/instagram-automation", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Falha no upload");
      setFile(null);
      setFileAfter(null);
      setAssetTitle("");
      setAssetCaption("");
      setMessage({ text: "Mídia adicionada ao rodízio.", type: "success" });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Erro", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(id: string) {
    if (!confirm("Remover esta mídia do rodízio?")) return;
    await fetch(`/api/instagram-automation?assetId=${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div>
        <AdminHeader title="Instagram Automático" description="Stories diários na nuvem via API oficial da Meta" />
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Instagram Automático"
        description="Stories editoriais e comerciais em rodízio · três publicações diárias · sem mensalidade de ferramenta"
      />

      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${
            message.type === "success"
              ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
              : "border-red-700/50 bg-red-950/40 text-red-300"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 ring-1 ring-brand-700/30">
            <Instagram className="h-5 w-5 text-brand-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Meta Graph API: {configured ? "credenciais OK" : "faltam variáveis de ambiente"}
            </p>
            <p className="text-xs text-slate-500">
              INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID · imagens hospedadas no próprio banco
            </p>
          </div>
        </div>
        {settings.lastError && <p className="text-xs text-red-400">Último erro: {settings.lastError}</p>}
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-surface-850 to-black/30 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">Identidade editorial</p>
            <h2 className="mt-1 text-xl font-bold text-slate-100">Um perfil vivo, não um catálogo de ofertas</h2>
            <p className="mt-1 text-sm text-slate-500">A automação mistura conhecimento, bastidores, conversa e venda.</p>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">5 estilos prontos</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {storyExamples.map((example) => (
            <div key={example.src} className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25 p-2">
              <div className="relative aspect-[9/16] overflow-hidden rounded-xl">
                <Image src={example.src} alt={`Exemplo de story: ${example.label}`} fill className="object-cover transition duration-500 group-hover:scale-[1.03]" />
              </div>
              <p className="px-1 pb-1 pt-2 text-center text-[11px] font-semibold text-slate-400">{example.label}</p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-brand-200">Publicação automática</h2>

          <label className={`flex items-center justify-between gap-4 rounded-xl border border-surface-600 bg-surface-850 p-4 ${configured ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}>
            <div>
              <p className="text-sm font-semibold text-slate-200">Ativar postagens</p>
              <p className="text-xs text-slate-500">Cron horário na Vercel dispara nos horários abaixo (fuso SP)</p>
            </div>
            <div className={`relative h-7 w-12 rounded-full ${settings.enabled ? "bg-brand-500" : "bg-surface-500"}`}>
              <div
                className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  settings.enabled ? "translate-x-5" : ""
                }`}
              />
              <input
                type="checkbox"
                className="hidden"
                checked={settings.enabled}
                disabled={!configured}
                onChange={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
              />
            </div>
          </label>
          {!configured && <p className="text-xs text-amber-300">Conecte a conta Business da Meta para liberar a publicação. As prévias já funcionam sem credenciais.</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Horários gratuitos</label>
              <input
                className="input"
                value={settings.publishTimes}
                readOnly
                placeholder="09:00,14:00,19:00"
              />
              <p className="mt-1.5 text-xs text-slate-500">Manhã, tarde e noite com três rotinas diárias do Vercel.</p>
            </div>
            <div>
              <label className="label">Bloquear repetição (dias)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={90}
                value={settings.blockRepeatDays}
                onChange={(e) => setSettings((s) => ({ ...s, blockRepeatDays: Number(e.target.value) || 7 }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Mix automático de conteúdo</label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {contentOptions.map((option) => {
                  const Icon = option.icon;
                  const active = settings.rotationCategories.split(",").includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleContentCategory(option.key)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-xs font-semibold transition ${
                        active
                          ? "border-brand-500/35 bg-brand-500/10 text-slate-100"
                          : "border-white/[0.06] bg-black/10 text-slate-600"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? option.tone : "text-slate-700"}`} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">O sistema alterna educação, interação, bastidores e vendas sem repetir o mesmo assunto.</p>
            </div>
            <div>
              <label className="label">Texto CTA</label>
              <input
                className="input"
                value={settings.ctaText}
                onChange={(e) => setSettings((s) => ({ ...s, ctaText: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-surface-600 bg-surface-850 p-4">
              <input
                type="checkbox"
                checked={settings.vacantSlotsCampaign}
                onChange={() => setSettings((s) => ({ ...s, vacantSlotsCampaign: !s.vacantSlotsCampaign }))}
              />
              <span className="text-sm text-slate-200">Campanha de horários vagos da agenda</span>
            </label>
          </div>

          <button type="submit" disabled={saving} className="btn-primary inline-flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-brand-200">Pré-visualização / publicação manual</h2>
          <div className="flex flex-wrap gap-2">
            {(["manha", "tarde", "noite"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  slot === s ? "bg-brand-600 text-white" : "bg-surface-700 text-slate-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={handlePreview} className="btn-secondary inline-flex items-center gap-2">
              <Eye className="h-4 w-4" /> Gerar preview
            </button>
            <button type="button" disabled={busy} onClick={() => handlePublish(true)} className="btn-secondary inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Dry-run
            </button>
            <button type="button" disabled={busy || !configured} onClick={() => handlePublish(false)} className="btn-primary inline-flex items-center gap-2">
              <Send className="h-4 w-4" /> Publicar agora
            </button>
          </div>
          {previewMeta && <p className="text-xs text-slate-400">{previewMeta}</p>}
          {previewUrl && (
            <div className="relative mx-auto aspect-[9/16] w-48 overflow-hidden rounded-xl border border-surface-600">
              <Image src={previewUrl} alt="Preview story" fill className="object-cover" unoptimized />
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-bold text-brand-200">Fotos / promoções (rodízio)</h2>
          <form onSubmit={handleUploadAsset} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                  <option value="before_after">Antes e depois</option>
                  <option value="promo">Promoção</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={assetCategory} onChange={(e) => setAssetCategory(e.target.value)}>
                  <option value="geral">Geral</option>
                  <option value="lavagem">Lavagem</option>
                  <option value="polimento">Polimento</option>
                  <option value="higienizacao">Higienização</option>
                  <option value="promocao">Promoção</option>
                </select>
              </div>
            </div>
            <input className="input" placeholder="Título" value={assetTitle} onChange={(e) => setAssetTitle(e.target.value)} />
            <input className="input" placeholder="Legenda" value={assetCaption} onChange={(e) => setAssetCaption(e.target.value)} />
            <div>
              <label className="label">{assetType === "before_after" ? "Foto antes" : "Imagem"}</label>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            {assetType === "before_after" && (
              <div>
                <label className="label">Foto depois</label>
                <input type="file" accept="image/*" onChange={(e) => setFileAfter(e.target.files?.[0] || null)} />
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-secondary inline-flex items-center gap-2">
              <Upload className="h-4 w-4" /> Adicionar ao rodízio
            </button>
          </form>

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-surface-600 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-200">{a.title || a.type}</p>
                  <p className="text-xs text-slate-500">
                    {a.category} · usado {a.timesUsed}x
                  </p>
                </div>
                <button type="button" onClick={() => removeAsset(a.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {assets.length === 0 && <p className="text-sm text-slate-500">Nenhuma mídia ainda — o rodízio usa serviços do catálogo.</p>}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-bold text-brand-200">Histórico, alcance e erros</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="pb-2">Quando</th>
                <th className="pb-2">Slot</th>
                <th className="pb-2">Conteúdo</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Alcance</th>
                <th className="pb-2">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-700">
              {history.map((p) => (
                <tr key={p.id} className="text-slate-300">
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {p.publishedAt
                      ? new Date(p.publishedAt).toLocaleString("pt-BR")
                      : new Date(p.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-2">{p.slot}</td>
                  <td className="py-2 pr-2">
                    <span className="font-medium text-slate-200">{p.title}</span>
                    <span className="block text-xs text-slate-500">{p.contentType}</span>
                  </td>
                  <td className="py-2 pr-2">{p.status}</td>
                  <td className="py-2 pr-2">{p.reach ?? p.impressions ?? "—"}</td>
                  <td className="py-2 text-xs text-red-400">{p.error || "—"}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    Nenhum story registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
