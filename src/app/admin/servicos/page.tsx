"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, EyeOff, Pencil, Plus, Trash2, Wrench } from "lucide-react";
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

const emptyForm = {
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

function toPayload(form: typeof emptyForm) {
  const num = (v: string) => (v ? parseFloat(v) : undefined);
  return {
    name: form.name,
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

function getCategoryLabel(categoryNum: number | null | undefined) {
  return categoryOptions.find((option) => option.value === categoryNum)?.label ?? `Categoria ${categoryNum ?? 1}`;
}

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);

  const groupedServices = useMemo(() => {
    const grouped = categoryOptions.map((option) => ({
      ...option,
      services: services.filter((service) => resolveServiceCategoryNum(service) === option.value),
    }));

    return grouped.sort((a, b) => a.value - b.value);
  }, [services]);

  async function load() {
    const res = await fetch("/api/servicos");
    const data = await res.json();
    if (data.success) setServices(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate(categoryNum = 1) {
    setEditing(null);
    setForm({ ...emptyForm, categoryNum: String(categoryNum) });
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
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(form);
    const url = editing ? `/api/servicos/${editing.id}` : "/api/servicos";
    const response = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setModalOpen(false);
      await load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Desativar este serviço?")) return;
    await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Serviços"
        description="Cadastre serviços por categoria e eles entram automaticamente no fluxo do WhatsApp e do test-bot"
        actions={
          <button onClick={() => openCreate()} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo serviço
          </button>
        }
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm">
        Os serviços cadastrados aqui são usados automaticamente no catálogo do WhatsApp, no fluxo oficial e no fluxo de teste.
      </div>

      {loading ? (
        <div className="card">
          <p className="text-center text-slate-500">Carregando...</p>
        </div>
      ) : services.length === 0 ? (
        <div className="card">
          <EmptyState icon={Wrench} title="Nenhum serviço cadastrado" />
        </div>
      ) : (
        <div className="space-y-4">
          {groupedServices.map((group) => (
            <section key={group.value} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{group.label}</h3>
                  <p className="text-sm text-slate-500">
                    {group.services.length > 0 ? `${group.services.length} serviço(s)` : "Nenhum serviço ainda"}
                  </p>
                </div>
                <button type="button" onClick={() => openCreate(group.value)} className="btn-secondary text-sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </button>
              </div>

              {group.services.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Esta categoria ainda não tem serviços. Clique em “Adicionar” para criar um.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.services.map((service) => (
                    <div key={service.id} className="rounded-xl border border-amber-200 bg-white/80 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{service.name}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {service.whatsappShort || service.description || "Sem descrição cadastrada"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(service)} className="rounded p-1 hover:bg-slate-100">
                            <Pencil className="h-4 w-4 text-slate-500" />
                          </button>
                          <button onClick={() => handleDelete(service.id)} className="rounded p-1 hover:bg-red-50">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-sm">
                        <span className="rounded-full bg-slate-100 px-2 py-1">💰 {formatCurrency(Number(service.price))}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                          {service.timeEstimate || `${service.durationMin} min`}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          {service.showInWhatsApp ? <><Eye className="mr-1 inline h-3.5 w-3.5" /> WhatsApp</> : <><EyeOff className="mr-1 inline h-3.5 w-3.5" /> Oculto</>}
                        </span>
                        <span className={service.active ? "rounded-full bg-emerald-100 px-2 py-1 text-emerald-700" : "rounded-full bg-red-100 px-2 py-1 text-red-700"}>
                          {service.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar serviço" : "Novo serviço"}
      >
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={form.categoryNum} onChange={(e) => setForm({ ...form, categoryNum: e.target.value })}>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Descrição</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Preço base (R$) *</label>
              <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div>
              <label className="label">Duração (min) *</label>
              <input className="input" type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required />
            </div>
            <div>
              <label className="label">Tempo estimado</label>
              <input className="input" placeholder="1h a 2h" value={form.timeEstimate} onChange={(e) => setForm({ ...form, timeEstimate: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Chave do catálogo</label>
              <input className="input" placeholder="lavagem_tecnica" value={form.catalogKey} onChange={(e) => setForm({ ...form, catalogKey: e.target.value })} />
            </div>
            <div>
              <label className="label">Ordem no menu</label>
              <input className="input" type="number" value={form.menuOrder} onChange={(e) => setForm({ ...form, menuOrder: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Preço hatch min</label>
              <input className="input" type="number" value={form.priceHatchMin} onChange={(e) => setForm({ ...form, priceHatchMin: e.target.value })} />
            </div>
            <div>
              <label className="label">Preço hatch max</label>
              <input className="input" type="number" value={form.priceHatchMax} onChange={(e) => setForm({ ...form, priceHatchMax: e.target.value })} />
            </div>
            <div>
              <label className="label">Preço SUV min</label>
              <input className="input" type="number" value={form.priceSuvMin} onChange={(e) => setForm({ ...form, priceSuvMin: e.target.value })} />
            </div>
            <div>
              <label className="label">Preço SUV max</label>
              <input className="input" type="number" value={form.priceSuvMax} onChange={(e) => setForm({ ...form, priceSuvMax: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Pitch WhatsApp</label>
            <input className="input" value={form.whatsappPitch} onChange={(e) => setForm({ ...form, whatsappPitch: e.target.value })} />
          </div>
          <div>
            <label className="label">Resumo WhatsApp</label>
            <input className="input" value={form.whatsappShort} onChange={(e) => setForm({ ...form, whatsappShort: e.target.value })} />
          </div>
          <div>
            <label className="label">Detalhe completo</label>
            <textarea className="input" rows={4} value={form.whatsappDetail} onChange={(e) => setForm({ ...form, whatsappDetail: e.target.value })} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Upsell — serviço</label>
              <select className="input" value={form.upsellServiceId} onChange={(e) => setForm({ ...form, upsellServiceId: e.target.value })}>
                <option value="">Nenhum</option>
                {services.filter((service) => service.id !== editing?.id).map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Benefício do upsell</label>
              <input className="input" value={form.upsellBenefit} onChange={(e) => setForm({ ...form, upsellBenefit: e.target.value })} />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.showInWhatsApp} onChange={(e) => setForm({ ...form, showInWhatsApp: e.target.checked })} />
            <span className="text-sm">Exibir no menu WhatsApp</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span className="text-sm">Serviço ativo</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
