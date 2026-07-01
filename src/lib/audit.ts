import { prisma } from './prisma';

export async function logAudit(opts: { userId?: string | null; action: string; resource: string; data?: any; ip?: string | null }) {
  try {
    await prisma.auditLog.create({ data: { userId: opts.userId ?? null, action: opts.action, resource: opts.resource, data: opts.data ?? null, ip: opts.ip ?? null } });
  } catch (err) {
    console.error('audit log error', err);
  }
}
