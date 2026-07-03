export const MessageDirection = {
  INBOUND: "INBOUND",
  OUTBOUND: "OUTBOUND",
} as const;

export type MessageDirection = typeof MessageDirection[keyof typeof MessageDirection];

export const MessageSender = {
  CLIENT: "CLIENT",
  BOT: "BOT",
  ADMIN: "ADMIN",
} as const;

export type MessageSender = typeof MessageSender[keyof typeof MessageSender];
