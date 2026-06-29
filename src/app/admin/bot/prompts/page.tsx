"use client";

import { useEffect, useState } from "react";
import { Save, MessageSquare } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface BotPrompt {
  key: string;
  label: string;
  category: string;
  content: string;
  hint: string | null;
}

export default function BotPromptsPage() {
  const [prompts, setPrompts] = useState<BotPrompt[]>([]);
  const [selected, setSelected] = useState<BotPrompt | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");

  async function load() {
    const res = await fetch("/api/bot/prompts");
    const data = await res.json();
    if (data.success) {
      setPrompts(data.data);
      if (!selected && data.data.length > 0) {
        setSelected(data.data[0]);
        setContent(data.data[0].content);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function selectPrompt(p: BotPrompt) {
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
      setMessage("Prompt salvo!");
      load();
    } else {
      setMessage(data.error ?? "Erro ao salvar");
    }
  }

  const categories = ["all", ...Array.from(new Set(prompts.map((p) => p.category)))];
  const filtered =
    filter === "all" ? prompts : prompts.filter((p) => p.category === filter);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Carregando...</div>;
  }

  return (
    <div>
      <AdminHeader
        title="Prompts do Bot"
        description="Edite as mensagens de cada etapa do fluxo WhatsApp"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <div className="mb-3 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filter === cat ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {cat === "all" ? "Todos" : cat}
              </button>
            ))}
          </div>
          <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
            {filtered.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => selectPrompt(p)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    selected?.key === p.key
                      ? "bg-brand-50 text-brand-700"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card lg:col-span-2">
          {selected ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-brand-600" />
                <h2 className="text-lg font-semibold">{selected.label}</h2>
              </div>
              {selected.hint && (
                <p className="text-xs text-slate-500">
                  Variáveis disponíveis: {selected.hint}
                </p>
              )}
              <textarea
                className="input min-h-[20rem] font-mono text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              {message && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    message.includes("salvo") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  {message}
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary">
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Salvando..." : "Salvar prompt"}
              </button>
            </form>
          ) : (
            <p className="text-slate-500">Selecione um prompt à esquerda</p>
          )}
        </div>
      </div>
    </div>
  );
}
