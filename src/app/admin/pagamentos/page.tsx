"use client";

import { useEffect, useState } from "react";
import { Save, QrCode, CreditCard, Smartphone, Wallet } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import Image from "next/image";

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
    return <div className="flex h-64 items-center justify-center text-slate-500">Carregando...</div>;
  }

  return (
    <div>
      <AdminHeader title="Pagamentos" description="Configure QR Code PIX e outras formas de pagamento" />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Configuração PIX */}
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">PIX (QR Code)</h2>
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

          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={handleGenerateQrCode}
              disabled={generatingQr || !settings.pixKey || !settings.pixHolderName}
              className="btn-secondary"
            >
              <QrCode className="mr-2 h-4 w-4" />
              {generatingQr ? "Gerando..." : "Gerar QR Code"}
            </button>
            <span className="text-xs text-slate-500">
              Gera um QR Code de exemplo para preview no bot WhatsApp
            </span>
          </div>

          {settings.pixQrCodeImage && (
            <div className="mt-6 rounded-lg border border-slate-200 p-4">
              <label className="label mb-2">QR Code gerado (preview)</label>
              <div className="flex items-center gap-4">
                <Image
                  src={settings.pixQrCodeImage}
                  alt="QR Code PIX"
                  width={128}
                  height={128}
                  className="rounded border border-slate-300"
                />
                <div className="text-sm text-slate-600">
                  <p className="font-medium">QR Code para pagamentos PIX</p>
                  <p className="mt-1 text-xs">
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
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Cartão de Crédito (Em breve)</h2>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
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
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">Outras formas de pagamento (Em breve)</h2>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              Boleto bancário, transferência, e outras formas estarão disponíveis em breve.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.includes("sucesso") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </form>
    </div>
  );
}
