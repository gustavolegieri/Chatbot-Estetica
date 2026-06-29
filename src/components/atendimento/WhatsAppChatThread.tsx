"use client";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

export function WhatsAppChatThread({ messages, clientName }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Nenhuma mensagem registrada ainda
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-y-auto rounded-xl p-4"
      style={{
        backgroundColor: "#e5ddd5",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.35'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <div className="mx-auto max-w-2xl space-y-2">
        {messages.map((msg) => {
          const isClient = msg.direction === "INBOUND";
          const isAdmin = msg.sender === "ADMIN";

          return (
            <div
              key={msg.id}
              className={cn("flex", isClient ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "relative max-w-[85%] rounded-lg px-3 py-2 shadow-sm",
                  isClient
                    ? "rounded-tl-none bg-white"
                    : isAdmin
                      ? "rounded-tr-none bg-[#dcf8c6] ring-2 ring-brand-200"
                      : "rounded-tr-none bg-[#dcf8c6]"
                )}
              >
                {!isClient && (
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {isAdmin ? "Você (admin)" : "Bot"}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {msg.body}
                </p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  {msg.flowStage && !isClient && (
                    <span className="text-[9px] text-slate-400">{msg.flowStage}</span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {format(new Date(msg.createdAt), "HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
