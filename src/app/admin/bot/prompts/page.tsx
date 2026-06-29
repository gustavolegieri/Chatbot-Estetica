"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save,
  MessageSquare,
  Search,
  RotateCcw,
  Eye,
  EyeOff,
  Download,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StatCard } from "@/components/ui/StatCard";
import {
  applyPrompt,
  CATEGORY_LABELS,
  parseVariables,
  renderWhatsAppHtml,
  SAMPLE_PREVIEW_VARS,
} from "@/lib/prompt-utils";

interface BotPrompt {
  key: string;
  label: string;
  category: string;
  content: string;
  hint: string | null;
  updatedAt?: string;
}

interface Meta {
  total: number;
  expected: number;
  byCategory: Record<string, number>;
}

const FLOW_ORDER = ["fluxo", "automacao", "categorias"];

export default function BotPromptsPage() {
  const [prompts, setPrompts] = useState<BotPrompt[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<BotPrompt | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

  const isDirty = selected ? content !== selected.content : false;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/bot/prompts");
    const data = await res.json();
    if (data.success) {
      setPrompts(data.data);
      setMeta(data.meta);
      if (data.data.length > 0) {
        setSelected((prev) => {
          const next = prev ? data.data.find((p: BotPrompt) => p.key === prev.key) ?? data.data[0] : data.data[0];
          setContent(next.content);
          return next;
        });
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    const vars = parseVariables(selected.hint);
    const initial: Record<string, string> = {};
    for (const v of vars) {
      initial[v] = SAMPLE_PREVIEW_VARS[v] ?? `[${v}]`;
    }
    setPreviewVars(initial);
  }, [selected?.key, selected?.hint]);

  function selectPrompt(p: BotPrompt) {
    if (isDirty && !confirm("Você tem alterações não salvas. Descartar?")) return;
    setSelected(p);
    setContent(p.content);
    setMessage("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/bot/prompts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selected.key, content }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setMessage("Prompt salvo com sucesso!");
      await load();
    } else {
      setMessage(data.error ?? "Erro ao salvar");
    }
  }

  async function handleResetOne() {
    if (!selected || !confirm(`Restaurar "${selected.label}" para o texto padrão?`)) return;
    const res = await fetch("/api/bot/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset", key: selected.key }),
    });
    const data = await res.json();
    if (data.success) {
      setContent(data.data.content);
      setMessage("Prompt restaurado ao padrão.");
      await load();
    }
  }

  async function handleSeedAll(force = false) {
    const msg = force
      ? "Isso vai sobrescrever TODOS os prompts com os textos padrão. Continuar?"
      : "Carregar prompts que ainda não existem no banco?";
    if (!confirm(msg)) return;
    setSeeding(true);
    const res = await fetch("/api/bot/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed", force }),
    });
    const data = await res.json();
    setSeeding(false);
    if (data.success) {
      setMessage(force ? "Todos os prompts foram restaurados." : "Prompts inicializados!");
      await load();
    }
  }

  function insertVariable(name: string) {
    const tag = `{${name}}`;
    setContent((prev) => (prev ? `${prev}${prev.endsWith("\n") ? "" : " "}${tag}` : tag));
  }

  const categories = useMemo(() => {
    const cats = [...new Set(prompts.map((p) => p.category))];
    return cats.sort((a, b) => FLOW_ORDER.indexOf(a) - FLOW_ORDER.indexOf(b));
  }, [prompts]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? prompts : prompts.filter((p) => p.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [prompts, filter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, BotPrompt[]> = {};
    for (const p of filtered) {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    }
    return groups;
  }, [filtered]);

  const previewText = useMemo(() => {
    if (!content) return "";
    return applyPrompt(content, previewVars);
  }, [content, previewVars]);

  const variables = selected ? parseVariables(selected.hint) : [];

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Carregando prompts...</div>;
  }

  return (
    <div>
      <AdminHeader
        title="Prompts do Bot"
        description="Edite cada mensagem do fluxo WhatsApp — com preview ao vivo"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSeedAll(false)}
              disabled={seeding}
              className="btn-secondary"
            >
              <Download className="mr-2 h-4 w-4" />
              {seeding ? "Carregando..." : "Inicializar faltantes"}
            </button>
            <button
              type="button"
              onClick={() => handleSeedAll(true)}
              disabled={seeding}
              className="btn-danger"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar todos
            </button>
          </div>
        }
      />

      {prompts.length === 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">Nenhum prompt no banco de dados</p>
            <p className="mt-1 text-sm text-amber-800">
              Clique em &quot;Inicializar faltantes&quot; para carregar os {meta?.expected ?? 35} textos padrão.
            </p>
            <button type="button" onClick={() => handleSeedAll(false)} className="btn-primary mt-3">
              <Sparkles className="mr-2 h-4 w-4" />
              Carregar prompts agora
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total de prompts" value={meta?.total ?? 0} icon={MessageSquare} />
        <StatCard
          title="Fluxo principal"
          value={meta?.byCategory?.fluxo ?? 0}
          icon={MessageSquare}
        />
        <StatCard title="Automações" value={meta?.byCategory?.automacao ?? 0} icon={Sparkles} />
        <StatCard title="Categorias menu" value={meta?.byCategory?.categorias ?? 0} icon={MessageSquare} />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Sidebar lista */}
        <div className="card xl:col-span-3">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Buscar prompt..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                filter === "all" ? "bg-brand-600 text-surface-950" : "bg-surface-750 text-slate-400"
              }`}
            >
              Todos ({prompts.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  filter === cat ? "bg-brand-600 text-surface-950" : "bg-surface-750 text-slate-400"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({meta?.byCategory?.[cat] ?? 0})
              </button>
            ))}
          </div>

          <div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Nenhum prompt encontrado</p>
            ) : filter === "all" && !search ? (
              FLOW_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  <ul className="space-y-0.5">
                    {grouped[cat]?.map((p) => (
                      <li key={p.key}>
                        <button
                          type="button"
                          onClick={() => selectPrompt(p)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                            selected?.key === p.key
                              ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                              : "text-slate-300 hover:bg-surface-750"
                          }`}
                        >
                          <span className="block font-medium">{p.label}</span>
                          <span className="text-xs text-slate-400">{p.key}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => selectPrompt(p)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                        selected?.key === p.key
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                          : "text-slate-300 hover:bg-surface-750"
                      }`}
                    >
                      <span className="block font-medium">{p.label}</span>
                      <span className="text-xs text-slate-400">
                        {CATEGORY_LABELS[p.category] ?? p.category}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="card xl:col-span-5">
          {selected ? (
            <form onSubmit={handleSave} className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-brand-600" />
                    <h2 className="text-lg font-semibold">{selected.label}</h2>
                    {isDirty && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        não salvo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{selected.key}</p>
                </div>
                <button type="button" onClick={handleResetOne} className="btn-secondary text-xs">
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Restaurar padrão
                </button>
              </div>

              {variables.length > 0 && (
                <div>
                  <p className="label mb-2">Inserir variável (clique)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="rounded-md bg-surface-750 px-2 py-1 font-mono text-xs text-brand-300 hover:bg-brand-900/40 hover:text-brand-200"
                      >
                        {`{${v}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="label mb-0">Texto da mensagem</label>
                  <span className="text-xs text-slate-400">
                    {content.length} caracteres · {content.split("\n").length} linhas
                  </span>
                </div>
                <textarea
                  className="input min-h-[18rem] font-mono text-sm leading-relaxed"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Formatação WhatsApp: <code className="rounded bg-surface-750 px-1 text-brand-300">*negrito*</code>{" "}
                  <code className="rounded bg-surface-750 px-1 text-brand-300">_itálico_</code>
                </p>
              </div>

              {message && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
                    message.includes("sucesso") || message.includes("restaurad") || message.includes("inicializ")
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {(message.includes("sucesso") || message.includes("restaurad")) && (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                  {message}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !isDirty} className="btn-primary">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
                {isDirty && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setContent(selected.content);
                      setMessage("");
                    }}
                  >
                    Descartar
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-slate-500">Selecione um prompt na lista ao lado</p>
              {prompts.length === 0 && (
                <button type="button" onClick={() => handleSeedAll(false)} className="btn-primary mt-4">
                  Carregar prompts padrão
                </button>
              )}
            </div>
          )}
        </div>

        {/* Preview WhatsApp */}
        <div className="card xl:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Preview WhatsApp</h3>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="btn-secondary py-1.5 text-xs"
            >
              {showPreview ? (
                <>
                  <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar
                </>
              )}
            </button>
          </div>

          {showPreview && selected ? (
            <>
              {variables.length > 0 && (
                <div className="mb-4 space-y-2 rounded-lg border border-brand-900/40 bg-surface-800 p-3">
                  <p className="text-xs font-medium text-slate-600">Valores de teste no preview</p>
                  {variables.slice(0, 6).map((v) => (
                    <div key={v}>
                      <label className="mb-0.5 block font-mono text-xs text-slate-500">{`{${v}}`}</label>
                      <input
                        className="input py-1.5 text-xs"
                        value={previewVars[v] ?? ""}
                        onChange={(e) => setPreviewVars((prev) => ({ ...prev, [v]: e.target.value }))}
                      />
                    </div>
                  ))}
                  {variables.length > 6 && (
                    <p className="text-xs text-slate-400">+ {variables.length - 6} variáveis usando valores padrão</p>
                  )}
                </div>
              )}

              <div className="rounded-xl bg-[#e5ddd5] p-4" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
                <div className="max-w-[95%] rounded-lg rounded-tl-none bg-surface-750 px-3 py-2 shadow-sm ring-1 ring-brand-900/30">
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
                    dangerouslySetInnerHTML={{ __html: renderWhatsAppHtml(previewText) }}
                  />
                  <p className="mt-1 text-right text-[10px] text-slate-400">
                    {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
                  Ver texto bruto enviado
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-green-400">
                  {previewText}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              {selected ? "Preview oculto" : "Selecione um prompt para ver o preview"}
            </p>
          )}

          <div className="mt-6 rounded-lg border border-brand-900/40 bg-surface-800 p-3">
            <p className="text-xs font-semibold text-slate-600">Dicas de formatação</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              <li>• Use variáveis entre chaves: {"{clientName}"}</li>
              <li>• Opções numeradas: *1* 📅 Agendar</li>
              <li>• Quebras de linha são preservadas no WhatsApp</li>
              <li>• Alterações só valem após clicar em Salvar</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
