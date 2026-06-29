"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";

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

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const res = await fetch("/api/servicos");
    const data = await res.json();
    if (data.success) setServices(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
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
    await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Desativar este serviço?")) return;
    await fetch(`/api/servicos/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <AdminHeader
        title="Serviços"
        description="Gerencie serviços, preços WhatsApp e catálogo do bot"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo serviço
          </button>
        }
      />

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : services.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhum serviço cadastrado" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 font-medium">Nome</th>
                <th className="pb-3 font-medium">Preço base</th>
                <th className="pb-3 font-medium">WhatsApp</th>
                <th className="pb-3 font-medium">Categoria</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.catalogKey && <p className="text-xs text-slate-500">{s.catalogKey}</p>}
                  </td>
                  <td className="py-3">{formatCurrency(Number(s.price))}</td>
                  <td className="py-3">
                    {s.showInWhatsApp ? (
                      <span className="text-green-600">Ativo</span>
                    ) : (
                      <span className="text-slate-400">Oculto</span>
                    )}
                  </td>
                  <td className="py-3">{s.categoryNum ?? "—"}</td>
                  <td className="py-3">
                    <span className={s.active ? "text-green-600" : "text-red-600"}>
                      {s.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(s)} className="rounded p-1 hover:bg-slate-100">
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="rounded p-1 hover:bg-red-50">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar serviço" : "Novo serviço"}
      >
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Preço base (R$) *</label>
              <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
            </div>
            <div>
              <label className="label">Duração (min) *</label>
              <input className="input" type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} required />
            </div>
          </div>

          <hr className="border-slate-200" />
          <h3 className="font-semibold text-slate-800">WhatsApp / catálogo</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Chave do catálogo</label>
              <input className="input" placeholder="lavagem_tecnica" value={form.catalogKey} onChange={(e) => setForm({ ...form, catalogKey: e.target.value })} />
            </div>
            <div>
              <label className="label">Categoria menu</label>
              <select className="input" value={form.categoryNum} onChange={(e) => setForm({ ...form, categoryNum: e.target.value })}>
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ordem no menu</label>
              <input className="input" type="number" value={form.menuOrder} onChange={(e) => setForm({ ...form, menuOrder: e.target.value })} />
            </div>
            <div>
              <label className="label">Tempo estimado</label>
              <input className="input" placeholder="1h a 2h" value={form.timeEstimate} onChange={(e) => setForm({ ...form, timeEstimate: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <label className="label">Detalhe completo (substitui texto automático)</label>
            <textarea className="input" rows={4} value={form.whatsappDetail} onChange={(e) => setForm({ ...form, whatsappDetail: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Upsell — serviço</label>
              <select className="input" value={form.upsellServiceId} onChange={(e) => setForm({ ...form, upsellServiceId: e.target.value })}>
                <option value="">Nenhum</option>
                {services.filter((s) => s.id !== editing?.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
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
