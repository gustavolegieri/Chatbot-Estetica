"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

export function PwaInstallButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [secureContext, setSecureContext] = useState(true);

  useEffect(() => {
    setInstalled(isStandalone());
    setSecureContext(window.isSecureContext);
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (installed) {
      window.location.href = "/admin/mobile";
      return;
    }
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className={cn(
          compact
            ? "flex w-full items-center gap-3 rounded-xl border border-brand-700/25 bg-brand-950/35 px-3 py-2.5 text-left text-sm font-semibold text-brand-200 transition hover:border-brand-500/35 hover:bg-brand-900/25"
            : "inline-flex items-center justify-center gap-2 rounded-xl bg-gold-gradient px-4 py-2.5 text-sm font-bold text-surface-950 shadow-gold transition hover:brightness-110",
          className
        )}
      >
        {installed ? <CheckCircle2 className="h-[18px] w-[18px] shrink-0" /> : <Download className="h-[18px] w-[18px] shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{installed ? "Abrir aplicativo" : "Instalar aplicativo"}</span>
        {compact && <Smartphone className="h-4 w-4 shrink-0 opacity-60" />}
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Como instalar o aplicativo">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101815] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300"><Smartphone className="h-5 w-5" /></span>
              <button type="button" onClick={() => setShowHelp(false)} className="rounded-full p-2 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Instalar Garagem do Ka</h2>
            {!secureContext && <p className="mt-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5 text-sm leading-6 text-amber-200">A instalação está bloqueada porque esta página foi aberta por HTTP. No celular, use o endereço publicado com <strong>HTTPS</strong>.</p>}
            <p className="mt-2 text-sm leading-6 text-slate-400">No iPhone, abra esta página no Safari, toque em <strong className="text-slate-200">Compartilhar</strong> e depois em <strong className="text-slate-200">Adicionar à Tela de Início</strong>.</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">No Android, abra no Chrome e toque em <strong className="text-slate-200">Instalar aplicativo</strong> ou <strong className="text-slate-200">Adicionar à tela inicial</strong>.</p>
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-slate-400"><Share className="h-4 w-4 text-brand-300" /> O aplicativo abrirá direto na central mobile.</div>
          </div>
        </div>
      )}
    </>
  );
}
