/** Contexto de logging durante processamento de uma mensagem inbound */

import { AsyncLocalStorage } from "node:async_hooks";

export interface MessageLogContext {
  phone: string;
  sessionId: string;
  clientId?: string | null;
  getStage: () => string | undefined;
  /** Responde em voz quando a mensagem de entrada veio em áudio. */
  replyWithAudio?: boolean;
  /** Evita gerar mais de um áudio para a mesma mensagem recebida. */
  voiceReplySent?: boolean;
}

let activeContext: MessageLogContext | null = null;
const messageContextStorage = new AsyncLocalStorage<MessageLogContext>();

export function setMessageLogContext(ctx: MessageLogContext | null) {
  activeContext = ctx;
}

export function getMessageLogContext(): MessageLogContext | null {
  return messageContextStorage.getStore() ?? activeContext;
}

export async function runWithMessageLogContext<T>(
  ctx: MessageLogContext,
  fn: () => Promise<T>
): Promise<T> {
  return messageContextStorage.run(ctx, async () => {
    setMessageLogContext(ctx);
    try {
      return await fn();
    } finally {
      setMessageLogContext(null);
    }
  });
}
