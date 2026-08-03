import { prisma } from "./prisma";

export async function getRuntimeSettings() {
  return prisma.settings.findUnique({ where: { id: "default" } });
}

export async function getSessionResetMs(): Promise<number> {
  // Regra comercial fixa: toda conversa recomeça após uma hora sem interação.
  // O campo legado permanece no banco para compatibilidade com instalações antigas.
  return 60 * 60 * 1000;
}

export async function getFollowupIdleMs(): Promise<number> {
  const s = await getRuntimeSettings();
  return (s?.followupIdleMin ?? 10) * 60 * 1000;
}
