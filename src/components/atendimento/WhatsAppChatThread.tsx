"use client";

import { CheckCheck, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  sender: "CLIENT" | "BOT" | "ADMIN";
  body: string;
  flowStage: string | null;
  createdAt: string;
}

interface Props {
  messages: ChatMessage[];
  clientName: string;
  className?: string;
}

export function WhatsAppChatThread({ messages, clientName, className }: Props) {
  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-white/10 bg-[#efeae2] px-6 text-center text-sm text-slate-500",
          className
        )}
      >
        Nenhuma mensagem registrada ainda para {clientName}.
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-y-auto rounded-xl border border-black/10 p-3 shadow-inner sm:p-4", className)}
      style={{
        backgroundColor: "#efeae2",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d8d2c9' fill-opacity='0.46'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="mx-auto max-w-3xl space-y-2.5">
        <div className="sticky top-0 z-10 flex justify-center pb-1">
          <span className="rounded-full bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-sm">
            Histórico da conversa
          </span>
        </div>

        {messages.map((message) => {
          const isClient = message.direction === "INBOUND";
          const isAdmin = message.sender === "ADMIN";
          const isBot = message.sender === "BOT";

          return (
            <div key={message.id} className={cn("flex", isClient ? "justify-start" : "justify-end")}>
              <article
                className={cn(
                  "relative max-w-[88%] rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.14)] sm:max-w-[78%]",
                  isClient
                    ? "rounded-tl-sm bg-white text-slate-800"
                    : isAdmin
                      ? "rounded-tr-sm bg-[#d9fdd3] text-slate-800 ring-1 ring-brand-500/35"
                      : "rounded-tr-sm bg-[#d9fdd3] text-slate-800"
                )}
              >
                {!isClient && (
                  <div className="mb-1 flex items-center gap-1.5">
                    {isBot ? <Sparkles className="h-3 w-3 text-violet-600" /> : null}
                    <p className={cn("text-[10px] font-bold uppercase tracking-[0.1em]", isAdmin ? "text-brand-700" : "text-violet-700")}>
                      {isAdmin ? "Equipe Garagem" : "IA Cerebras"}
                    </p>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                <footer className="mt-1.5 flex items-end justify-end gap-1.5">
                  {message.flowStage && !isClient && (
                    <span className="max-w-32 truncate rounded bg-black/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                      {message.flowStage}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {format(new Date(message.createdAt), "HH:mm", { locale: ptBR })}
                  </span>
                  {!isClient && <CheckCheck className="h-3.5 w-3.5 text-sky-600" aria-label="Enviada" />}
                </footer>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
