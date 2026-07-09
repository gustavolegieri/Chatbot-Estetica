"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";
import { resolveServiceCategoryNum } from "@/lib/service-category";

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: string;
  durationMin: number;
  active: boolean;
  catalogKey: string | null;
  categoryNum: number | null;
  menuOrder: number;
  whatsappPitch: string | null;
  whatsappShort: string | null;
  whatsappDetail: string | null;
  priceHatchMin: string | null;
  priceHatchMax: string | null;
  priceSuvMin: string | null;
  priceSuvMax: string | null;
  timeEstimate: string | null;
  upsellServiceId: string | null;
  upsellBenefit: string | null;
  showInWhatsApp: boolean;
  upsellService?: { id: string; name: string } | null;
}

interface ServiceFormState {
  name: string;
  description: string;
  price: string;
  durationMin: string;
  active: boolean;
  catalogKey: string;
  categoryNum: string;
  menuOrder: string;
  whatsappPitch: string;
  whatsappShort: string;
  whatsappDetail: string;
  priceHatchMin: string;
  priceHatchMax: string;
  priceSuvMin: string;
  priceSuvMax: string;
  timeEstimate: string;
  upsellServiceId: string;
  upsellBenefit: string;
  showInWhatsApp: boolean;
}

const categoryOptions = [
  { value: 1, label: "1 — Lavagem" },
  { value: 2, label: "2 — Polimento" },
  { value: 3, label: "3 — Proteção" },
  { value: 4, label: "4 — Interior" },
  { value: 5, label: "5 — Revitalização" },
  { value: 6, label: "6 — Detalhes" },
  { value: 7, label: "7 — Pacotes" },
  { value: 8, label: "8 — Ajuda" },
];

const emptyForm: ServiceFormState = {
  name: "",
  description: "",
  price: "",
  durationMin: "60",
  active: true,
  catalogKey: "",
  categoryNum: "1",
  menuOrder: "0",
  whatsappPitch: "",
  whatsappShort: "",
  whatsappDetail: "",
  priceHatchMin: "",
  priceHatchMax: "",
  priceSuvMin: "",
  priceSuvMax: "",
  timeEstimate: "",
  upsellServiceId: "",
  upsellBenefit: "",
  showInWhatsApp: true,
};

function toPayload(form: ServiceFormState) {
  const num = (value: string) => (value ? parseFloat(value) : undefined);
  return {
    name: form.name.trim(),
    description: form.description || undefined,
    price: parseFloat(form.price),
    durationMin: parseInt(form.durationMin, 10),
    active: form.active,
    catalogKey: form.catalogKey || null,
    categoryNum: form.categoryNum ? parseInt(form.categoryNum, 10) : null,
    menuOrder: parseInt(form.menuOrder, 10) || 0,
    whatsappPitch: form.whatsappPitch || null,
    whatsappShort: form.whatsappShort || null,
    whatsappDetail: form.whatsappDetail || null,
    priceHatchMin: num(form.priceHatchMin) ?? null,
    priceHatchMax: num(form.priceHatchMax) ?? null,
    priceSuvMin: num(form.priceSuvMin) ?? null,
    priceSuvMax: num(form.priceSuvMax) ?? null,
    timeEstimate: form.timeEstimate || null,
    upsellServiceId: form.upsellServiceId || null,
    upsellBenefit: form.upsellBenefit || null,
    showInWhatsApp: form.showInWhatsApp,
  };
}

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [whatsappFilter, setWhatsappFilter] = useState<"all" | "show" | "hidden">("all");
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>(
    Object.fromEntries(categoryOptions.map((option) => [option.value, true])) as Record<number, boolean>
  );
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/servicos");
    const data = await res.json();
    if (data.success) setServices(data.data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return services.filter((service) => {
      const matchesQuery =
        !query ||
        service.name.toLowerCase().includes(query) ||
        (service.description ?? "").toLowerCase().includes(query) ||
        (service.whatsappShort ?? "").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" || (statusFilter === "active" ? service.active : !service.active);
      const matchesWhatsapp =
        whatsappFilter === "all" ||
        (whatsappFilter === "show" ? service.showInWhatsApp : !service.showInWhatsApp);

      return matchesQuery && matchesStatus && matchesWhatsapp;
    });
  }, [services, search, statusFilter, whatsappFilter]);

  const groupedServices = useMemo(() => {
    return categoryOptions
      .map((option) => ({
        ...option,
        services: filteredServices
          .filter((service) => resolveServiceCategoryNum(service) === option.value)
          .sort((a, b) => (a.menuOrder || 0) - (b.menuOrder || 0) || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.value - b.value);
  }, [filteredServices]);

  function openCreate(categoryNum = 1) {
    setEditing(null);
    setForm({ ...emptyForm, categoryNum: String(categoryNum) });
    setNotice(null);
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setForm({
      name: service.name,
      description: service.description ?? "",
      price: String(service.price),
      durationMin: String(service.durationMin),
      active: service.active,
      catalogKey: service.catalogKey ?? "",
      categoryNum: String(service.categoryNum ?? 1),
      menuOrder: String(service.menuOrder ?? 0),
      whatsappPitch: service.whatsappPitch ?? "",
      whatsappShort: service.whatsappShort ?? "",
      whatsappDetail: service.whatsappDetail ?? "",
      priceHatchMin: service.priceHatchMin ? String(service.priceHatchMin) : "",
      priceHatchMax: service.priceHatchMax ? String(service.priceHatchMax) : "",
      priceSuvMin: service.priceSuvMin ? String(service.priceSuvMin) : "",
      priceSuvMax: service.priceSuvMax ? String(service.priceSuvMax) : "",
      timeEstimate: service.timeEstimate ?? "",
      upsellServiceId: service.upsellServiceId ?? "",
      upsellBenefit: service.upsellBenefit ?? "",
      showInWhatsApp: service.showInWhatsApp,
    });
    setNotice(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.price || !form.durationMin) return;

    setSubmitting(true);
    const payload = toPayload(form);
    const url = editing ? `/api/servicos/${editing.id}` : "/api/servicos";
    const response = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);
    if (response.ok) {
      setModalOpen(false);
      setNotice({ tone: "success", text: editing ? "Serviço atualizado com sucesso." : "Serviço criado com sucesso." });
      await load();
    } else {
      setNotice({ tone: "error", text: "Não foi possível salvar o serviço." });
    }
  }

  async function handleDelete(service: Service) {
    if (!confirm(`Excluir o serviço “${service.name}”?`)) return;
    const response = await fetch(`/api/servicos/${service.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotice({ tone: "success", text: "Serviço removido." });
      await load();
    } else {
      setNotice({ tone: "error", text: "Não foi possível remover o serviço." });
    }
  }

  async function handleToggleActive(service: Service) {
    const response = await fetch(`/api/servicos/${service.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });

    if (response.ok) {
      setNotice({ tone: "success", text: service.active ? "Serviço desativado." : "Serviço ativado." });
      await load();
    }
  }

  async function handleToggleWhatsApp(service: Service) {
    const response = await fetch(`/api/servicos/${service.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInWhatsApp: !service.showInWhatsApp }),
    });

    if (response.ok) {
      setNotice({ tone: "success", text: service.showInWhatsApp ? "Removido do WhatsApp." : "Liberado no WhatsApp." });
      await load();
    }
  }

  async function handleDuplicate(service: Service) {
    const payload = toPayload({
      ...emptyForm,
      ...{
        name: `${service.name} (cópia)`,
        description: service.description ?? "",
        price: String(service.price),
        durationMin: String(service.durationMin),
        active: service.active,
        catalogKey: service.catalogKey ?? "",
        categoryNum: String(service.categoryNum ?? 1),
        menuOrder: String(service.menuOrder ?? 0),
        whatsappPitch: service.whatsappPitch ?? "",
        whatsappShort: service.whatsappShort ?? "",
        whatsappDetail: service.whatsappDetail ?? "",
        priceHatchMin: service.priceHatchMin ? String(service.priceHatchMin) : "",
        priceHatchMax: service.priceHatchMax ? String(service.priceHatchMax) : "",
        priceSuvMin: service.priceSuvMin ? String(service.priceSuvMin) : "",
        priceSuvMax: service.priceSuvMax ? String(service.priceSuvMax) : "",
        timeEstimate: service.timeEstimate ?? "",
        upsellServiceId: service.upsellServiceId ?? "",
        upsellBenefit: service.upsellBenefit ?? "",
        showInWhatsApp: service.showInWhatsApp,
      },
    });

    const response = await fetch("/api/servicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setNotice({ tone: "success", text: "Serviço duplicado. Ajuste os campos e salve." });
      await load();
    }
  }

  function toggleCategory(categoryNum: number) {
    setExpandedCategories((current) => ({ ...current, [categoryNum]: !current[categoryNum] }));
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Serviços"
        description="Gerencie serviços, categorias, preços, disponibilidade no WhatsApp e ordem de exibição"
        actions={
          <button onClick={() => openCreate()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-brand-50 transition hover:bg-brand-500">
            <Plus className="mr-2 inline h-4 w-4" />
            Novo serviço
          </button>
        }
      />

      {notice && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.tone === "success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-red-400/30 bg-red-500/10 text-red-200"}`}>
          {notice.text}
        </div>
      )}

      <div className="rounded-2xl border border-brand-800/30 bg-surface-900/80 p-4 shadow-gold-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-brand-200">Gestão completa</h2>
            <p className="text-sm text-slate-400">
              Controle o que aparece no WhatsApp, a ordem dos serviços e os dados de cada item.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-[220px] items-center gap-2 rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-slate-400">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar serviço"
                className="w-full bg-transparent outline-none"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}
              className="rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <select
              value={whatsappFilter}
              onChange={(event) => setWhatsappFilter(event.target.value as "all" | "show" | "hidden")}
              className="rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100"
            >
              <option value="all">WhatsApp / todos</option>
              <option value="show">Exibidos no WhatsApp</option>
              <option value="hidden">Ocultos</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-brand-800/20 bg-surface-800/70 p-8 text-center text-slate-400">
            <p>Carregando serviços...</p>
          </div>
        ) : services.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhum serviço cadastrado" />
        ) : (
          <div className="space-y-3">
            {groupedServices.map((group) => {
              const isExpanded = expandedCategories[group.value] ?? true;
              return (
                <section key={group.value} className="overflow-hidden rounded-2xl border border-brand-800/20 bg-surface-800/70">
                  <button
                    type="button"
                    onClick={() => toggleCategory(group.value)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-brand-400" /> : <ChevronRight className="h-4 w-4 text-brand-400" />}
                        <h3 className="font-semibold text-brand-200">{group.label}</h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {group.services.length} serviço(s) · {group.services.filter((item) => item.active).length} ativo(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openCreate(group.value);
                      }}
                      className="rounded-xl border border-brand-700/30 bg-brand-900/40 px-3 py-2 text-sm text-brand-200 transition hover:bg-brand-800/70"
                    >
                      <Plus className="mr-1 inline h-4 w-4" />
                      Adicionar
                    </button>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-brand-800/20 p-4">
                      {group.services.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-brand-700/30 bg-surface-900/60 p-4 text-sm text-slate-400">
                          Nenhum serviço nesta categoria com os filtros atuais.
                        </div>
                      ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {group.services.map((service) => (
                            <div key={service.id} className="rounded-2xl border border-brand-800/20 bg-surface-900/70 p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-semibold text-brand-100">{service.name}</h4>
                                    {service.showInWhatsApp ? (
                                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                                        WhatsApp
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                                        Oculto
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-2 text-sm text-slate-400">
                                    {service.whatsappShort || service.description || "Sem descrição cadastrada."}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleToggleActive(service)} className="rounded-lg border border-brand-700/30 p-2 text-brand-300 transition hover:bg-brand-900/50">
                                    {service.active ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                  </button>
                                  <button onClick={() => openEdit(service)} className="rounded-lg border border-brand-700/30 p-2 text-brand-300 transition hover:bg-brand-900/50">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleDuplicate(service)} className="rounded-lg border border-brand-700/30 p-2 text-brand-300 transition hover:bg-brand-900/50">
                                    <Copy className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleDelete(service)} className="rounded-lg border border-red-400/30 p-2 text-red-300 transition hover:bg-red-500/10">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                                <span className="rounded-full bg-brand-900/60 px-2 py-1 text-brand-200">
                                  💰 {formatCurrency(Number(service.price))}
                                </span>
                                <span className="rounded-full bg-brand-900/60 px-2 py-1 text-brand-200">
                                  <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                                  {service.timeEstimate || `${service.durationMin} min`}
                                </span>
                                <span className={service.active ? "rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300" : "rounded-full bg-slate-700 px-2 py-1 text-slate-300"}>
                                  {service.active ? "Ativo" : "Inativo"}
                                </span>
                                <span className="rounded-full bg-brand-900/60 px-2 py-1 text-brand-200">
                                  Ordem {service.menuOrder || 0}
                                </span>
                              </div>

                              <div className="mt-4 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleWhatsApp(service)}
                                  className="rounded-xl border border-brand-700/30 px-3 py-2 text-sm text-brand-100 transition hover:bg-brand-900/50"
                                >
                                  {service.showInWhatsApp ? <><Eye className="mr-1 inline h-4 w-4" /> Mostrar no WhatsApp</> : <><EyeOff className="mr-1 inline h-4 w-4" /> Ocultar</>}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar serviço" : "Novo serviço"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Nome *</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Categoria</label>
              <select className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" value={form.categoryNum} onChange={(event) => setForm({ ...form, categoryNum: event.target.value })}>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-200">Descrição do serviço</label>
            <textarea className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Preço base (R$) *</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Duração *</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.durationMin} onChange={(event) => setForm({ ...form, durationMin: event.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Tempo estimado</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" placeholder="1h a 2h" value={form.timeEstimate} onChange={(event) => setForm({ ...form, timeEstimate: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Chave do catálogo</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" value={form.catalogKey} onChange={(event) => setForm({ ...form, catalogKey: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Ordem na categoria</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.menuOrder} onChange={(event) => setForm({ ...form, menuOrder: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Preço hatch min</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.priceHatchMin} onChange={(event) => setForm({ ...form, priceHatchMin: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Preço hatch max</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.priceHatchMax} onChange={(event) => setForm({ ...form, priceHatchMax: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Preço SUV min</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.priceSuvMin} onChange={(event) => setForm({ ...form, priceSuvMin: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-200">Preço SUV max</label>
              <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" type="number" value={form.priceSuvMax} onChange={(event) => setForm({ ...form, priceSuvMax: event.target.value })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-200">Pitch WhatsApp</label>
            <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" value={form.whatsappPitch} onChange={(event) => setForm({ ...form, whatsappPitch: event.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-200">Resumo WhatsApp</label>
            <input className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" value={form.whatsappShort} onChange={(event) => setForm({ ...form, whatsappShort: event.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-200">Detalhe completo</label>
            <textarea className="w-full rounded-xl border border-brand-800/30 bg-surface-800 px-3 py-2 text-sm text-brand-100 outline-none focus:border-brand-500" rows={4} value={form.whatsappDetail} onChange={(event) => setForm({ ...form, whatsappDetail: event.target.value })} />
          </div>

          <div className="flex flex-wrap gap-4 pt-2 text-sm text-brand-100">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              <span>Serviço ativo</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.showInWhatsApp} onChange={(event) => setForm({ ...form, showInWhatsApp: event.target.checked })} />
              <span>Disponível no WhatsApp</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-brand-700/30 px-4 py-2 text-sm text-brand-100 transition hover:bg-brand-900/50">
              Cancelar
            </button>
            <button type="submit" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-brand-50 transition hover:bg-brand-500" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar serviço"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
