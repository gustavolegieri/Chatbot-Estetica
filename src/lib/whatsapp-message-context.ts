/** Contexto de logging durante processamento de uma mensagem inbound */

export interface MessageLogContext {
  phone: string;
  sessionId: string;
  clientId?: string | null;
  getStage: () => string | undefined;
}

let activeContext: MessageLogContext | null = null;

export function setMessageLogContext(ctx: MessageLogContext | null) {
  activeContext = ctx;
}

export function getMessageLogContext(): MessageLogContext | null {
  return activeContext;
}

export async function runWithMessageLogContext<T>(
  ctx: MessageLogContext,
  fn: () => Promise<T>
): Promise<T> {
  setMessageLogContext(ctx);
  try {
    return await fn();
  } finally {
    setMessageLogContext(null);
  }
}
