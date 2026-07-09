"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

interface RatingEvent {
  id: string;
  sessionId: string;
  rating: number;
  createdAt: string;
}

export default function TestBotEvaluationPage() {
  const [metrics, setMetrics] = useState<{
    totalRatings: number;
    averageRating: number;
    latestRatings: RatingEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const response = await fetch("/api/admin/teste/metrics");
        const data = await response.json();
        if (data.success) {
          setMetrics(data.data);
        } else {
          setError(data.error || "Erro ao carregar métricas");
        }
      } catch (err) {
        setError("Erro ao carregar métricas");
      }
    }
    loadMetrics();
  }, []);

  return (
    <div className="space-y-6 rounded-lg border border-slate-700/50 bg-slate-950 p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-900/30 text-brand-200">
          <Star className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-brand-300">Avaliação do Teste Bot</h1>
          <p className="text-sm text-slate-400">Acompanhe o desempenho do bot em tempo real.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : !metrics ? (
        <div className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">Carregando métricas...</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Total de avaliações</p>
            <p className="mt-3 text-4xl font-semibold text-white">{metrics.totalRatings}</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Média</p>
            <p className="mt-3 text-4xl font-semibold text-white">{metrics.averageRating.toFixed(2)}</p>
          </div>
          <div className="lg:col-span-2 rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Últimas avaliações</p>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{metrics.latestRatings.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {metrics.latestRatings.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma avaliação registrada ainda.</p>
              ) : (
                metrics.latestRatings.map((rating) => (
                  <div key={rating.id} className="rounded-2xl bg-slate-950 p-4 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-white">{rating.sessionId}</span>
                      <span className="text-brand-300">{rating.rating} ⭐</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{new Date(rating.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
