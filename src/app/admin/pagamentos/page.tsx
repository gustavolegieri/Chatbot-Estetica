"use client";

import { useEffect, useState } from "react";
import { Save, QrCode, CreditCard, Smartphone, Wallet } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";

interface PaymentSettings {
  pixKey: string | null;
  pixHolderName: string | null;
  pixBank: string | null;
  pixMerchantCity: string | null;
  pixQrCodeImage: string | null;
  // Futuras formas de pagamento
  creditCardEnabled: boolean;
  mercadoPagoToken: string | null;
  stripePublicKey: string | null;
  stripeSecretKey: string | null;
}

export default function PagamentosPage() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [generatingQr, setGeneratingQr] = useState(false);

  useEffect(() => {
    fetch("/api/pagamentos")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSettings(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerateQrCode() {
    if (!settings || !settings.pixKey || !settings.pixHolderName) {
      setMessage("Para gerar o QR Code, preencha a chave PIX e nome do titular primeiro.");
      return;
    }

    setGeneratingQr(true);
    setMessage("");

    try {
      const res = await fetch("/api/pagamentos/generate-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 1.00, // Valor de exemplo para gerar o QR Code
          description: "Pagamento de exemplo",
        }),
      });

      const data = await res.json();
      if (data.success && data.qrCodeDataUrl) {
        setSettings({ ...settings, pixQrCodeImage: data.qrCodeDataUrl });
        setMessage("QR Code gerado com sucesso!");
      } else {
        setMessage(data.error || "Erro ao gerar QR Code");
      }
    } catch (error) {
      console.error("Erro ao gerar QR Code:", error);
      setMessage("Erro ao gerar QR Code");
    } finally {
      setGeneratingQr(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage("");

    let res: Response;
    try {
      res = await fetch("/api/pagamentos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
    } catch {
      setSaving(false);
      setMessage("Servidor offline. Rode npm run dev na porta 3000 e tente de novo.");
      return;
    }

    const data = await res.json();
    setSaving(false);
    setMessage(data.success ? "Configurações salvas com sucesso!" : data.error ?? "Erro ao salvar");
  }

  if (loading || !settings) {
    return (
      <div>
        <AdminHeader title="Pagamentos" description="Configure o PIX e os meios aceitos pela operação." />
        <div className="flex h-64 items-center justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader title="Pagamentos" description="Configure o PIX e mantenha o checkout do WhatsApp alinhado à operação." />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Configuração PIX */}
        <div className="card">
          <div className="mb-6 flex items-center gap-3 border-b border-surface-700 pb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/35 ring-1 ring-emerald-700/40">
              <Smartphone className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-100">PIX (QR Code)</h2>
              <p className="mt-1 text-sm text-slate-400">Dados enviados pelo bot quando o cliente escolhe pagar via PIX.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Chave PIX</label>
              <input
                className="input"
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                value={settings.pixKey ?? ""}
                onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Nome do titular</label>
              <input
                className="input"
                placeholder="Nome completo do beneficiário"
                value={settings.pixHolderName ?? ""}
                onChange={(e) => setSettings({ ...settings, pixHolderName: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Banco</label>
              <input
                className="input"
                placeholder="Ex: Banco do Brasil, Nubank, Itaú"
                value={settings.pixBank ?? ""}
                onChange={(e) => setSettings({ ...settings, pixBank: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Cidade do beneficiário</label>
              <input
                className="input"
                placeholder="Ex: Jundiai"
                value={settings.pixMerchantCity ?? ""}
                onChange={(e) => setSettings({ ...settings, pixMerchantCity: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-brand-700/30 bg-brand-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand-100">Pré-visualização do QR Code</p>
              <p className="mt-1 text-xs text-slate-500">Gere uma cobrança de exemplo para validar a experiência no bot.</p>
            </div>
            <button
              type="button"
              onClick={handleGenerateQrCode}
              disabled={generatingQr || !settings.pixKey || !settings.pixHolderName}
              className="btn-secondary"
            >
              <QrCode className="mr-2 h-4 w-4" />
              {generatingQr ? "Gerando..." : "Gerar QR Code"}
            </button>
          </div>

          {settings.pixQrCodeImage && (
            <div className="mt-6 rounded-xl border border-surface-700 bg-surface-850 p-5">
              <label className="label mb-3">QR Code gerado (preview)</label>
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.pixQrCodeImage}
                  alt="QR Code PIX"
                  className="h-32 w-32 rounded-lg border border-brand-700/35 bg-white p-1"
                />
                <div className="text-sm text-slate-300">
                  <p className="font-semibold text-brand-100">QR Code para pagamentos PIX</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Este QR Code será enviado automaticamente pelo bot quando o cliente escolher
                    pagar via PIX.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Configurações futuras - Placeholder */}
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-900/35 ring-1 ring-sky-700/40"><CreditCard className="h-5 w-5 text-sky-400" /></div>
            <div><h2 className="text-lg font-semibold text-brand-100">Cartão de Crédito</h2><p className="text-sm text-slate-400">Integração planejada para uma próxima etapa.</p></div>
          </div>

          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <p className="text-sm leading-6 text-slate-400">
              Integração com gateways de pagamento (Mercado Pago, Stripe, etc) estará disponível
              em breve.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 opacity-50">
            <div>
              <label className="label">Mercado Pago Access Token</label>
              <input
                className="input"
                placeholder="Seu token do Mercado Pago"
                value={settings.mercadoPagoToken ?? ""}
                onChange={(e) => setSettings({ ...settings, mercadoPagoToken: e.target.value })}
                disabled
              />
            </div>
            <div>
              <label className="label">Stripe Public Key</label>
              <input
                className="input"
                placeholder="Sua chave pública do Stripe"
                value={settings.stripePublicKey ?? ""}
                onChange={(e) => setSettings({ ...settings, stripePublicKey: e.target.value })}
                disabled
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Stripe Secret Key</label>
              <input
                className="input"
                type="password"
                placeholder="Sua chave secreta do Stripe"
                value={settings.stripeSecretKey ?? ""}
                onChange={(e) => setSettings({ ...settings, stripeSecretKey: e.target.value })}
                disabled
              />
            </div>
          </div>
        </div>

        {/* Outras formas de pagamento */}
        <div className="card">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-900/35 ring-1 ring-violet-700/40"><Wallet className="h-5 w-5 text-violet-400" /></div>
            <div><h2 className="text-lg font-semibold text-brand-100">Outras formas de pagamento</h2><p className="text-sm text-slate-400">Estrutura pronta para novas integrações.</p></div>
          </div>

          <div className="rounded-xl border border-surface-700 bg-surface-850 p-4">
            <p className="text-sm leading-6 text-slate-400">
              Boleto bancário, transferência, e outras formas estarão disponíveis em breve.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={message.includes("sucesso") ? "rounded-xl border border-emerald-700/45 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200" : "rounded-xl border border-red-700/45 bg-red-950/25 px-4 py-3 text-sm text-red-200"}
          >
            {message}
          </div>
        )}

        <div className="flex justify-end border-t border-surface-700 pt-5">
          <button type="submit" disabled={saving} className="btn-primary gap-2 px-6 py-3">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      </form>
    </div>
  );
}
