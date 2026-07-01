"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers,
  RefreshCw,
  RotateCcw,
  Download,
  Zap,
  ShieldCheck,
  Link2,
  Shield,
  Activity,
} from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StatCard } from "@/components/ui/StatCard";

interface PromptMeta {
  total: number;
  expected: number;
  byCategory: Record<string, number>;
}

interface PromptItem {
  key: string;
  label: string;
  category: string;
  updatedAt?: string;
}

interface Settings {
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
  businessHoursStart: string;
  businessHoursEnd: string;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
  slotDurationMin: number;
  workingDays: string;
  whatsappEnabled: boolean;
  whatsappWelcomeMsg: string;
  evolutionApiUrl: string | null;
  evolutionApiKey: string | null;
  evolutionInstanceName: string | null;
  pixKey: string | null;
  pixHolderName: string | null;
  pixBank: string | null;
  sessionResetMin: number;
  followupIdleMin: number;
  reminder4hMin: number;
  reminder30minMin: number;
  autoCancelMin: number;
  updatedAt: string;
}

interface DashboardData {
  totalClients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  monthRevenue: number;
  monthExpenses: number;
  whatsappSessions: number;
  whatsappAppointments: number;
  blockedDatesCount: number;
  activeServices: number;
}

export default function SistemaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [promptMeta, setPromptMeta] = useState<PromptMeta | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const missingPrompts = useMemo(() => {
    if (!promptMeta) return 0;
    return Math.max(promptMeta.expected - promptMeta.total, 0);
  }, [promptMeta]);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const [promptRes, configRes, dashboardRes] = await Promise.all([
        fetch("/api/bot/prompts"),
        fetch("/api/configuracoes"),
        fetch("/api/dashboard"),
      ]);

      const promptData = await promptRes.json();
      const configData = await configRes.json();
      const dashboardData = await dashboardRes.json();

      if (promptData.success) {
        setPrompts(promptData.data);
        setPromptMeta(promptData.meta);
      }

      if (configData.success) {
        setSettings(configData.data);
      }

      if (dashboardData.success) {
        setDashboard(dashboardData.data);
      }
    } catch (error) {
      setMessage("Erro ao carregar dados do sistema. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSystem();
  }, [loadSystem]);

  async function executePromptAction(action: "seed" | "reset", force = false) {
    if (action === "reset" && !confirm("Isso irá restaurar todos os prompts para os padrões. Continuar?")) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/bot/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action === "seed" ? "seed" : "seed", force }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage(force ? "Todos os prompts foram restaurados." : "Prompts adicionados ao banco, se faltavam.");
        await loadSystem();
      } else {
        setMessage(data.error || "Falha ao executar ação de prompts.");
      }
    } catch {
      setMessage("Erro de rede ao executar ação de prompts.");
    } finally {
      setSaving(false);
    }
  }

  const categories = useMemo(() => {
    return promptMeta
      ? Object.entries(promptMeta.byCategory).map(([category, count]) => ({ category, count }))
      : [];
  }, [promptMeta]);

  const promptUpdatedAt = useMemo(() => {
    if (!prompts.length) return null;
    return prompts.reduce((latest, item) => {
      if (!item.updatedAt) return latest;
      return latest > item.updatedAt ? latest : item.updatedAt;
    }, prompts[0].updatedAt ?? "");
  }, [prompts]);

  return (
    <div>
      <AdminHeader
        title="Sistema"
        description="Controle completo do painel, prompts e saúde do bot"
        actions={
          <button onClick={loadSystem} className="btn-secondary">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </button>
        }
      />

      {message && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Prompts no banco" value={promptMeta?.total ?? "-"} icon={Zap} />
        <StatCard title="Total esperado" value={promptMeta?.expected ?? "-"} icon={Layers} />
        <StatCard title="Serviços ativos" value={dashboard?.activeServices ?? "-"} icon={ShieldCheck} />
        <StatCard title="Horários bloqueados" value={dashboard?.blockedDatesCount ?? "-"} icon={Activity} />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="card xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Status do sistema</h2>
              <p className="text-sm text-slate-500">Visão geral das configurações, prompts e métricas do bot.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => executePromptAction("seed", false)}
                disabled={saving}
                className="btn-secondary"
              >
                <Download className="mr-2 h-4 w-4" />
                Inicializar faltantes
              </button>
              <button
                type="button"
                onClick={() => executePromptAction("reset", true)}
                disabled={saving}
                className="btn-danger"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar padrões
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700/30 bg-surface-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">WhatsApp</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <p>
                  <span className="font-medium">Ativo:</span>{" "}
                  {settings?.whatsappEnabled ? "Sim" : "Não"}
                </p>
                <p>
                  <span className="font-medium">Mensagem inicial:</span>
                  <br />
                  {settings?.whatsappWelcomeMsg || "Não configurado"}
                </p>
                <p>
                  <span className="font-medium">Evolution API:</span>{" "}
                  {settings?.evolutionApiUrl ? "Configurado" : "Não configurado"}
                </p>
                {settings?.evolutionApiUrl && (
                  <p className="text-slate-400">{settings.evolutionApiUrl}</p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/30 bg-surface-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Negócio</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <p>
                  <span className="font-medium">Nome:</span> {settings?.businessName ?? "-"}
                </p>
                <p>
                  <span className="font-medium">Telefone:</span> {settings?.businessPhone ?? "-"}
                </p>
                <p>
                  <span className="font-medium">Endereço:</span> {settings?.businessAddress ?? "-"}
                </p>
                <p>
                  <span className="font-medium">Horário:</span> {settings?.businessHoursStart} — {settings?.businessHoursEnd}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700/30 bg-surface-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Automação</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <p>Reset de sessão: {settings?.sessionResetMin} min</p>
                <p>Follow-up: {settings?.followupIdleMin} min</p>
                <p>Lembrete 4h: {settings?.reminder4hMin} min</p>
                <p>Urgente 30min: {settings?.reminder30minMin} min</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/30 bg-surface-900 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Métricas do bot</p>
              <div className="mt-3 space-y-2 text-sm text-slate-200">
                <p>Sessões ativas (7d): {dashboard?.whatsappSessions ?? "-"}</p>
                <p>Agendamentos bot: {dashboard?.whatsappAppointments ?? "-"}</p>
                <p>Clientes totais: {dashboard?.totalClients ?? "-"}</p>
                <p>Agendamentos pendentes: {dashboard?.pendingAppointments ?? "-"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card xl:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Prompt metadata</h2>
              <p className="text-sm text-slate-500">Resumo dos prompts cadastrados e categorias.</p>
            </div>
            <div className="text-xs text-slate-400">
              Atualizado: {promptUpdatedAt ? new Date(promptUpdatedAt).toLocaleString("pt-BR") : "-"}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((item) => (
              <div key={item.category} className="rounded-xl border border-slate-700/30 bg-surface-900 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.category}</p>
                <p className="mt-2 text-2xl font-bold text-brand-200">{item.count}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-slate-700/30 bg-surface-900 p-4">
            <p className="text-sm font-medium text-slate-200">Status de prompts</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-800 p-4">
                <p className="text-xs text-slate-400">Prompts faltando</p>
                <p className="mt-2 text-2xl font-bold text-brand-200">{missingPrompts}</p>
              </div>
              <div className="rounded-xl bg-surface-800 p-4">
                <p className="text-xs text-slate-400">Prompts existentes</p>
                <p className="mt-2 text-2xl font-bold text-brand-200">{promptMeta?.total ?? "-"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card xl:col-span-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Acesso rápido</h2>
              <p className="text-sm text-slate-500">Navegue direto para as áreas do painel que gerenciam o sistema.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <a href="/admin/bot/prompts" className="rounded-xl border border-slate-700/30 bg-surface-900 p-4 transition hover:border-brand-400">
              <div className="flex items-center gap-3 text-brand-300">
                <Zap className="h-5 w-5" />
                <span>Prompts Bot</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">Editar mensagens do fluxo WhatsApp.</p>
            </a>
            <a href="/admin/configuracoes" className="rounded-xl border border-slate-700/30 bg-surface-900 p-4 transition hover:border-brand-400">
              <div className="flex items-center gap-3 text-brand-300">
                <Shield className="h-5 w-5" />
                <span>Configurações</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">Ajustar horário, API e automações.</p>
            </a>
            <a href="/admin/servicos" className="rounded-xl border border-slate-700/30 bg-surface-900 p-4 transition hover:border-brand-400">
              <div className="flex items-center gap-3 text-brand-300">
                <Layers className="h-5 w-5" />
                <span>Serviços</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">Gerenciar catálogo e serviços do bot.</p>
            </a>
            <a href="/admin/atendimento" className="rounded-xl border border-slate-700/30 bg-surface-900 p-4 transition hover:border-brand-400">
              <div className="flex items-center gap-3 text-brand-300">
                <Link2 className="h-5 w-5" />
                <span>Atendimento</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">Monitorar conversas e solicitar mão humana.</p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
