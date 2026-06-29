"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao fazer login");
        return;
      }

      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Background */}
      <div className="absolute inset-0 bg-surface-950" />
      <div className="absolute inset-0 bg-dark-radial opacity-80" />
      <div className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gold-shine opacity-30" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <p className="mt-4 font-serif text-xs uppercase tracking-[0.35em] text-brand-400/80">
            Estética Automotiva Premium
          </p>
          <p className="mt-2 text-sm text-slate-500">Acesse o painel administrativo</p>
        </div>

        <form onSubmit={handleSubmit} className="card border-brand-700/30">
          {error && (
            <div className="mb-4 rounded-lg bg-red-950/50 px-4 py-3 text-sm text-red-300 ring-1 ring-red-800/50">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@estetica.com"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar no painel"
            )}
          </button>

          <p className="mt-4 text-center text-xs text-slate-600">
            Demo: admin@estetica.com / admin123
          </p>
        </form>
      </div>
    </div>
  );
}
