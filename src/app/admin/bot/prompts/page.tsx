"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  Info,
  ListFilter,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
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

interface AIStatus {
  configured: boolean;
  model: string;
}

interface Meta {
  total: number;
  expected: number;
  byCategory: Record<string, number>;
  ai?: AIStatus;
}

type Notice = {
  tone: "success" | "error" | "info";
  text: string;
};

const FLOW_ORDER = ["fluxo", "automacao", "categorias"];

const CATEGORY_DETAILS: Record<string, { description: string; icon: typeof Workflow }> = {
  fluxo: { description: "Etapas que conduzem o cliente até o agendamento.", icon: Workflow },
  automacao: { description: "Lembretes e contatos enviados no momento certo.", icon: Sparkles },
  categorias: { description: "Nomes que organizam o menu de serviços.", icon: ListFilter },
};

function formatDate(value?: string) {
  if (!value) return "Sem publicação registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem publicação registrada";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function promptPurpose(prompt: BotPrompt) {
  if (prompt.category === "automacao") return "Automação de relacionamento";
  if (prompt.category === "categorias") return "Navegação do catálogo";
  if (/payment|pix|receipt|coupon|loyalty/i.test(prompt.key)) return "Mensagem transacional";
  if (/confirm|summary|logistics|day|time/i.test(prompt.key)) return "Jornada de agendamento";
  return "Jornada de atendimento";
}

function NoticeBanner({ notice }: { notice: Notice }) {
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? AlertCircle : Info;
  const tone =
    notice.tone === "success"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
      : notice.tone === "error"
        ? "border-red-500/25 bg-red-500/10 text-red-200"
        : "border-brand-500/25 bg-brand-500/10 text-brand-100";

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${tone}`} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{notice.text}</p>
    </div>
  );
}

export default function BotPromptsPage() {
  const [prompts, setPrompts] = useState<BotPrompt[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selected, setSelected] = useState<BotPrompt | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [officialAction, setOfficialAction] = useState<"apply" | "restore-all" | "restore-one" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

  const isDirty = selected ? content !== selected.content : false;
  const isMutatingOfficialCopy = officialAction !== null;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/bot/prompts");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Não foi possível carregar a central de inteligência.");
      }

      const nextPrompts = data.data as BotPrompt[];
      setPrompts(nextPrompts);
      setMeta(data.meta as Meta);
      setSelected((current) => {
        const next = current ? nextPrompts.find((item) => item.key === current.key) ?? nextPrompts[0] : nextPrompts[0];
        setContent(next?.content ?? "");
        return next ?? null;
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a central de inteligência.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setPreviewVars({});
      return;
    }

    const approvedVariables = parseVariables(`${selected.hint ?? ""}\n${selected.content}`);
    setPreviewVars(
      Object.fromEntries(approvedVariables.map((variable) => [variable, SAMPLE_PREVIEW_VARS[variable] ?? `{${variable}}`]))
    );
  }, [selected]);

  function selectPrompt(prompt: BotPrompt) {
    if (isDirty && !confirm("Você tem alterações não salvas. Deseja descartá-las e trocar de mensagem?")) return;
    setSelected(prompt);
    setContent(prompt.content);
    setNotice(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!content.trim()) {
      setNotice({ tone: "error", text: "A mensagem não pode ficar vazia." });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/bot/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: selected.key, content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Não foi possível publicar a mensagem.");

      setNotice({ tone: "success", text: "Mensagem publicada. Os próximos atendimentos já usarão esta versão." });
      await load(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Erro de conexão ao publicar a mensagem.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetOne() {
    if (!selected) return;
    const confirmed = confirm(
      `Restaurar a cópia oficial de “${selected.label}”? A versão publicada hoje será substituída.`
    );
    if (!confirmed) return;

    setOfficialAction("restore-one");
    setNotice(null);
    try {
      const res = await fetch("/api/bot/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", key: selected.key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Não foi possível restaurar esta mensagem.");

      setNotice({ tone: "success", text: "Cópia oficial restaurada e publicada com sucesso." });
      await load(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Erro de conexão ao restaurar a cópia oficial.",
      });
    } finally {
      setOfficialAction(null);
    }
  }

  async function handleOfficialCopy(force = false) {
    const message = force
      ? "Restaurar a cópia oficial de TODAS as mensagens? Isso substituirá todas as versões personalizadas hoje."
      : "Aplicar a base oficial às mensagens que ainda não existem? Nenhuma mensagem já personalizada será substituída.";
    if (!confirm(message)) return;

    setOfficialAction(force ? "restore-all" : "apply");
    setNotice(null);
    try {
      const res = await fetch("/api/bot/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", force }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Não foi possível aplicar a cópia oficial.");

      setNotice({
        tone: "success",
        text: force
          ? "Todas as mensagens foram restauradas para a cópia oficial."
          : "Base oficial aplicada às mensagens que estavam faltando.",
      });
      await load(true);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Erro de conexão ao aplicar a cópia oficial.",
      });
    } finally {
      setOfficialAction(null);
    }
  }

  function insertVariable(name: string) {
    const tag = `{${name}}`;
    setContent((previous) => (previous ? `${previous}${previous.endsWith("\n") ? "" : " "}${tag}` : tag));
  }

  const categories = useMemo(() => {
    const available = [...new Set(prompts.map((prompt) => prompt.category))];
    return available.sort((a, b) => {
      const aIndex = FLOW_ORDER.indexOf(a);
      const bIndex = FLOW_ORDER.indexOf(b);
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    });
  }, [prompts]);

  const filtered = useMemo(() => {
    let list = filter === "all" ? prompts : prompts.filter((prompt) => prompt.category === filter);
    if (search.trim()) {
      const query = search.toLocaleLowerCase("pt-BR");
      list = list.filter(
        (prompt) =>
          prompt.label.toLocaleLowerCase("pt-BR").includes(query) ||
          prompt.key.toLocaleLowerCase("pt-BR").includes(query) ||
          prompt.content.toLocaleLowerCase("pt-BR").includes(query)
      );
    }
    return list;
  }, [filter, prompts, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, BotPrompt[]> = {};
    for (const prompt of filtered) {
      (groups[prompt.category] ??= []).push(prompt);
    }
    return groups;
  }, [filtered]);

  const approvedVariables = useMemo(
    () => (selected ? parseVariables(`${selected.hint ?? ""}\n${selected.content}`) : []),
    [selected]
  );
  const currentVariables = useMemo(() => parseVariables(content), [content]);
  const unapprovedVariables = currentVariables.filter((variable) => !approvedVariables.includes(variable));
  const previewText = useMemo(() => applyPrompt(content, previewVars), [content, previewVars]);
  const latestUpdate = useMemo(
    () => prompts.reduce<string | undefined>((latest, prompt) => (!latest || (prompt.updatedAt && prompt.updatedAt > latest) ? prompt.updatedAt : latest), undefined),
    [prompts]
  );
  const selectedCategory = selected ? CATEGORY_DETAILS[selected.category] : undefined;
  const SelectedCategoryIcon = selectedCategory?.icon ?? MessageSquare;

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-surface-850" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-xl border border-white/[0.06] bg-surface-850" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="h-[38rem] animate-pulse rounded-xl border border-white/[0.06] bg-surface-850 xl:col-span-3" />
          <div className="h-[38rem] animate-pulse rounded-xl border border-white/[0.06] bg-surface-850 xl:col-span-5" />
          <div className="h-[38rem] animate-pulse rounded-xl border border-white/[0.06] bg-surface-850 xl:col-span-4" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
        <div className="card text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-red-300" />
          <h1 className="mt-4 text-lg font-semibold text-slate-100">Não foi possível abrir a central</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{loadError}</p>
          <button type="button" onClick={() => void load()} className="btn-primary mt-5">
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <AdminHeader
        eyebrow="CRM · Governança de IA"
        icon={BrainCircuit}
        title="Central de inteligência"
        description="Governança das mensagens do WhatsApp oficial, com fluxo controlado, IA Cerebras e cópia oficial sempre recuperável."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleOfficialCopy(false)}
              disabled={isMutatingOfficialCopy}
              className="btn-secondary"
              title="Adiciona apenas mensagens oficiais que ainda não existem"
            >
              <Download className="mr-2 h-4 w-4" />
              {officialAction === "apply" ? "Aplicando..." : "Aplicar base oficial"}
            </button>
            <button
              type="button"
              onClick={() => void handleOfficialCopy(true)}
              disabled={isMutatingOfficialCopy}
              className="btn-danger"
              title="Substitui todas as mensagens pela cópia oficial"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {officialAction === "restore-all" ? "Restaurando..." : "Restaurar cópia oficial"}
            </button>
          </div>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-brand-700/30 bg-gradient-to-br from-brand-950/70 via-surface-850 to-surface-850 shadow-gold">
        <div className="grid gap-px lg:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.75fr)]">
          <div className="relative p-5 sm:p-6">
            <div className="pointer-events-none absolute -left-10 top-0 h-44 w-44 rounded-full bg-brand-400/[0.08] blur-3xl" />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-brand-300">
                <ShieldCheck className="h-4 w-4" />
                Operação protegida
              </div>
              <h2 className="max-w-2xl text-xl font-semibold text-slate-100 sm:text-2xl">
                A IA cuida da conversa. O fluxo oficial cuida do compromisso.
              </h2>
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-400">
                As mensagens desta biblioteca definem o tom da marca em cada etapa. A Cerebras interpreta pedidos abertos e recomenda o próximo caminho, enquanto regras de agenda, valores e pagamentos continuam sob controle do fluxo.
              </p>
              <a href="/admin/test-bot" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 transition hover:text-brand-100">
                Simular uma conversa antes de publicar
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="border-t border-white/[0.06] bg-black/15 p-5 lg:border-l lg:border-t-0 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Motor de IA</p>
                <p className="mt-1 text-base font-semibold text-slate-100">Cerebras</p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  meta?.ai?.configured
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta?.ai?.configured ? "bg-emerald-400" : "bg-amber-300"}`} />
                {meta?.ai?.configured ? "Conectada" : "Aguardando chave"}
              </span>
            </div>
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-surface-900/65 p-3.5">
              <p className="text-xs text-slate-500">Modelo em uso</p>
              <p className="mt-1 break-all font-mono text-xs text-brand-200">{meta?.ai?.model ?? "Não informado"}</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              A chave da API permanece protegida no servidor e nunca é exibida neste painel.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Papéis no atendimento" className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.065] bg-surface-850/80 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900/40 text-brand-300 ring-1 ring-brand-700/30">
            <Workflow className="h-[18px] w-[18px]" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-100">Fluxo oficial</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">Define etapas, valida dados e mantém agenda, pagamento e confirmação em ordem.</p>
        </div>
        <div className="rounded-xl border border-white/[0.065] bg-surface-850/80 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300 ring-1 ring-violet-400/15">
            <BrainCircuit className="h-[18px] w-[18px]" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-100">Cerebras</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">Entende linguagem natural, apoia recomendações e responde dúvidas dentro do catálogo.</p>
        </div>
        <div className="rounded-xl border border-white/[0.065] bg-surface-850/80 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/15">
            <MessageSquare className="h-[18px] w-[18px]" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-100">Equipe</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">Assume conversas que pedem atenção humana e acompanha os casos no CRM.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Mensagens publicadas" value={meta?.total ?? 0} icon={MessageSquare} trend={`${meta?.expected ?? 0} na base oficial`} />
        <StatCard title="Jornada principal" value={meta?.byCategory?.fluxo ?? 0} icon={Workflow} trend="Atendimento e agendamento" />
        <StatCard title="Automações" value={meta?.byCategory?.automacao ?? 0} icon={Sparkles} trend="Lembretes e pós-venda" />
        <StatCard title="Última publicação" value={latestUpdate ? formatDate(latestUpdate) : "—"} icon={Clock3} trend="Biblioteca ativa" />
      </section>

      {prompts.length === 0 && (
        <section className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <h2 className="font-semibold text-amber-100">A biblioteca ainda não foi publicada</h2>
            <p className="mt-1 text-sm leading-6 text-amber-100/75">
              Aplique a base oficial para disponibilizar as mensagens padrão, sem criar nenhum atendimento ou alteração na agenda.
            </p>
            <button type="button" onClick={() => void handleOfficialCopy(false)} className="btn-primary mt-3" disabled={isMutatingOfficialCopy}>
              <Download className="mr-2 h-4 w-4" />
              Aplicar base oficial agora
            </button>
          </div>
        </section>
      )}

      {notice && <NoticeBanner notice={notice} />}

      <section className="grid gap-6 xl:grid-cols-12">
        <aside className="card flex min-h-[38rem] flex-col p-4 xl:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-400">Biblioteca</p>
              <h2 className="mt-1 text-base font-semibold text-slate-100">Mensagens do atendimento</h2>
            </div>
            <span className="rounded-full border border-brand-700/35 bg-brand-900/25 px-2 py-1 text-xs font-semibold text-brand-200">
              {filtered.length}/{prompts.length}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Buscar mensagem ou etapa"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar mensagens"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                filter === "all" ? "bg-brand-400 text-surface-950" : "bg-surface-750 text-slate-400 hover:bg-surface-700 hover:text-slate-200"
              }`}
            >
              Todas
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setFilter(category)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  filter === category
                    ? "bg-brand-400 text-surface-950"
                    : "bg-surface-750 text-slate-400 hover:bg-surface-700 hover:text-slate-200"
                }`}
              >
                {CATEGORY_LABELS[category] ?? category}
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center">
                <Search className="h-6 w-6 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">Nenhuma mensagem encontrada</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Tente outro nome, etapa ou termo do conteúdo.</p>
              </div>
            ) : filter === "all" && !search ? (
              categories.filter((category) => grouped[category]?.length).map((category) => {
                const detail = CATEGORY_DETAILS[category];
                const CategoryIcon = detail?.icon ?? MessageSquare;
                return (
                  <div key={category}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <CategoryIcon className="h-3.5 w-3.5 text-brand-400" />
                      <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">
                        {CATEGORY_LABELS[category] ?? category}
                      </p>
                    </div>
                    <ul className="space-y-1">
                      {grouped[category]?.map((prompt) => (
                        <li key={prompt.key}>
                          <button
                            type="button"
                            onClick={() => selectPrompt(prompt)}
                            className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                              selected?.key === prompt.key
                                ? "border-brand-500/40 bg-brand-900/30 shadow-[0_8px_18px_rgba(212,175,55,0.08)]"
                                : "border-transparent text-slate-300 hover:border-white/[0.07] hover:bg-surface-750/80"
                            }`}
                          >
                            <span className={`block text-sm font-semibold ${selected?.key === prompt.key ? "text-brand-100" : "text-slate-200"}`}>
                              {prompt.label}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">{prompt.key}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <ul className="space-y-1">
                {filtered.map((prompt) => (
                  <li key={prompt.key}>
                    <button
                      type="button"
                      onClick={() => selectPrompt(prompt)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        selected?.key === prompt.key
                          ? "border-brand-500/40 bg-brand-900/30 shadow-[0_8px_18px_rgba(212,175,55,0.08)]"
                          : "border-transparent text-slate-300 hover:border-white/[0.07] hover:bg-surface-750/80"
                      }`}
                    >
                      <span className={`block text-sm font-semibold ${selected?.key === prompt.key ? "text-brand-100" : "text-slate-200"}`}>
                        {prompt.label}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-500">{CATEGORY_LABELS[prompt.category] ?? prompt.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 border-t border-white/[0.06] px-1 pt-3 text-xs leading-5 text-slate-500">
            Alterações só entram no canal quando você usar <span className="font-semibold text-brand-300">Salvar e publicar</span>.
          </div>
        </aside>

        <main className="card min-h-[38rem] xl:col-span-5">
          {selected ? (
            <form onSubmit={handleSave} className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-900/35 text-brand-300 ring-1 ring-brand-700/30">
                      <SelectedCategoryIcon className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-100">{selected.label}</h2>
                        {isDirty ? (
                          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                            Rascunho não publicado
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                            Publicada
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">{selected.key}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{selectedCategory?.description ?? "Mensagem do atendimento oficial."}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleResetOne()}
                  disabled={isMutatingOfficialCopy || saving}
                  className="btn-secondary shrink-0 py-2 text-xs"
                  title="Substitui este texto pela cópia oficial"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {officialAction === "restore-one" ? "Restaurando..." : "Restaurar esta cópia"}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-brand-700/25 bg-brand-950/20 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-brand-100">Papel no atendimento</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {promptPurpose(selected)} · mantenha a linguagem direta, acolhedora e coerente com a Garagem.
                    </p>
                  </div>
                  <span className="rounded-full bg-surface-800 px-2 py-1 text-[10px] font-semibold text-slate-400">
                    WhatsApp oficial
                  </span>
                </div>
              </div>

              {approvedVariables.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="label mb-0">Campos reconhecidos pelo fluxo</label>
                    <span className="text-[11px] text-slate-500">Clique para adicionar ao fim do texto</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {approvedVariables.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertVariable(variable)}
                        className="rounded-lg border border-brand-700/30 bg-surface-850 px-2.5 py-1.5 font-mono text-xs text-brand-200 transition hover:border-brand-500/50 hover:bg-brand-900/25"
                        title={`Inserir {${variable}}`}
                      >
                        {`{${variable}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unapprovedVariables.length > 0 && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p>
                    Revise os campos {unapprovedVariables.map((variable) => `{${variable}}`).join(", ")}. Eles não fazem parte da cópia original desta etapa e podem não receber valor no atendimento.
                  </p>
                </div>
              )}

              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="prompt-content" className="label mb-0">Mensagem enviada ao cliente</label>
                  <span className="text-xs text-slate-500">
                    {content.length} caracteres · {content.split("\n").length} linhas
                  </span>
                </div>
                <textarea
                  id="prompt-content"
                  className="input min-h-[20rem] flex-1 resize-y font-mono text-sm leading-6"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  spellCheck={false}
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Formatação do WhatsApp: <code className="rounded bg-surface-750 px-1 py-0.5 text-brand-200">*negrito*</code>{" "}
                  <code className="rounded bg-surface-750 px-1 py-0.5 text-brand-200">_itálico_</code> · as quebras de linha são preservadas.
                </p>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                <button type="submit" disabled={saving || !isDirty || isMutatingOfficialCopy} className="btn-primary">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Publicando..." : "Salvar e publicar"}
                </button>
                {isDirty && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving || isMutatingOfficialCopy}
                    onClick={() => {
                      setContent(selected.content);
                      setNotice({ tone: "info", text: "Rascunho descartado. A versão publicada foi mantida." });
                    }}
                  >
                    Descartar rascunho
                  </button>
                )}
                <span className="ml-auto text-xs text-slate-500">Atualizada: {formatDate(selected.updatedAt)}</span>
              </div>
            </form>
          ) : (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900/30 text-brand-300 ring-1 ring-brand-700/30">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-100">Selecione uma mensagem</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">Escolha uma etapa da biblioteca para revisar a cópia, testar as variáveis e publicar uma atualização.</p>
            </div>
          )}
        </main>

        <aside className="card min-h-[38rem] xl:col-span-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/15">
                  <Send className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Prévia no WhatsApp</h2>
                  <p className="text-xs text-slate-500">Visualização segura, sem enviar mensagens.</p>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setShowPreview((visible) => !visible)} className="btn-secondary py-1.5 text-xs">
              {showPreview ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {showPreview ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          {showPreview && selected ? (
            <>
              {approvedVariables.length > 0 && (
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface-850 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-200">Dados de demonstração</p>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Não são dados reais</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    {approvedVariables.slice(0, 6).map((variable) => (
                      <label key={variable} className="block">
                        <span className="mb-1 block font-mono text-[11px] text-brand-300">{`{${variable}}`}</span>
                        <input
                          className="input py-1.5 text-xs"
                          value={previewVars[variable] ?? ""}
                          onChange={(event) => setPreviewVars((previous) => ({ ...previous, [variable]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  {approvedVariables.length > 6 && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">+ {approvedVariables.length - 6} campos usam os valores de demonstração padrão.</p>
                  )}
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/[0.07] bg-[#111b21] shadow-2xl">
                <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#202c33] px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-gradient text-xs font-bold text-surface-950">GK</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">Garagem do Ka</p>
                    <p className="text-[11px] text-emerald-300">Conta comercial · atendimento oficial</p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]" />
                </div>
                <div
                  className="min-h-[16rem] p-4"
                  style={{
                    backgroundColor: "#0b141a",
                    backgroundImage:
                      "radial-gradient(rgba(255,255,255,0.026) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)",
                    backgroundPosition: "0 0, 12px 12px",
                    backgroundSize: "24px 24px",
                  }}
                >
                  <div className="ml-auto max-w-[94%] rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2.5 shadow-lg ring-1 ring-white/[0.06]">
                    <div
                      className="whitespace-pre-wrap text-sm leading-6 text-white"
                      dangerouslySetInnerHTML={{ __html: renderWhatsAppHtml(previewText) }}
                    />
                    <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-emerald-100/65">
                      agora <CheckCircle2 className="h-3 w-3 text-sky-300" />
                    </p>
                  </div>
                </div>
              </div>

              <details className="mt-3 rounded-xl border border-white/[0.06] bg-surface-850 px-3.5 py-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-400 transition hover:text-slate-200">Ver conteúdo bruto enviado pela API</summary>
                <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-xs leading-5 text-emerald-200">
                  {previewText}
                </pre>
              </details>
            </>
          ) : (
            <div className="flex min-h-[19rem] flex-col items-center justify-center text-center">
              <EyeOff className="h-7 w-7 text-slate-600" />
              <p className="mt-3 text-sm text-slate-400">{selected ? "A prévia está oculta." : "Selecione uma mensagem para simular o envio."}</p>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-brand-700/25 bg-brand-950/20 p-4">
            <div className="flex items-center gap-2 text-brand-200">
              <ShieldCheck className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Checklist de publicação</h3>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Teste a cópia com os dados de demonstração.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Use somente campos reconhecidos pelo fluxo.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />Revise preços, prazos e condições antes de publicar.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />A cópia oficial pode ser restaurada a qualquer momento.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
