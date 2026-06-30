import { prisma } from "./prisma";

export async function getRuntimeSettings() {
  return prisma.settings.findUnique({ where: { id: "default" } });
}

export async function getSessionResetMs(): Promise<number> {
  const s = await getRuntimeSettings();
  return (s?.sessionResetMin ?? 30) * 60 * 1000;
}

export async function getFollowupIdleMs(): Promise<number> {
  const s = await getRuntimeSettings();
  return (s?.followupIdleMin ?? 10) * 60 * 1000;
}
