"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Car, Loader2, MessageCircle, Search, UserRound, X } from "lucide-react";

type SearchItem = {
  id: string;
  kind: "client" | "appointment" | "conversation";
  title: string;
  subtitle: string;
  meta?: string;
  href: string;
};

const icons = { client: UserRound, appointment: CalendarDays, conversation: MessageCircle };

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const payload = await response.json();
        if (payload.success) setItems(payload.data);
      } catch {
        // Uma nova busca cancela silenciosamente a anterior.
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
    setItems([]);
  }

  return (
    <div className="relative z-30 mb-4 flex justify-end sm:mb-5">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="group flex h-10 w-full items-center gap-3 rounded-xl border border-white/[0.075] bg-surface-850/75 px-3.5 text-left text-sm text-slate-500 shadow-[0_10px_28px_rgba(0,0,0,0.12)] transition hover:border-brand-500/25 hover:text-slate-300 sm:w-[360px]"
      >
        <Search className="h-4 w-4 text-brand-400/80" />
        <span className="flex-1 truncate">Buscar clientes, placas, serviços...</span>
        <span className="hidden rounded-md border border-white/[0.08] bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 sm:inline">Ctrl K</span>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Fechar busca" className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" onClick={close} />
          <section className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-brand-500/20 bg-[#111113] shadow-[0_32px_90px_rgba(0,0,0,0.62)]">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-brand-300" /> : <Search className="h-5 w-5 text-brand-300" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Digite nome, telefone, placa, veículo ou serviço"
                className="min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button type="button" onClick={close} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <div className="px-4 py-10 text-center">
                  <Car className="mx-auto h-8 w-8 text-brand-500/55" />
                  <p className="mt-3 text-sm font-medium text-slate-300">Busca central do CRM</p>
                  <p className="mt-1 text-xs text-slate-500">Encontre qualquer cliente, veículo, agendamento ou conversa.</p>
                </div>
              ) : !loading && items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhum resultado encontrado.</p>
              ) : (
                items.map((item) => {
                  const Icon = icons[item.kind];
                  return (
                    <Link key={`${item.kind}-${item.id}`} href={item.href} onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-brand-900/25">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-900/30 text-brand-300 ring-1 ring-inset ring-brand-600/20">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-200">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{item.subtitle}</span>
                      </span>
                      {item.meta && <span className="shrink-0 text-[11px] font-medium text-brand-400/80">{item.meta}</span>}
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
