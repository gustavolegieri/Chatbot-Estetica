import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const list = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ success: true, data: list });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, type, amount, validFrom, validTo, usageLimit, usagePerCustomer, active } = body;
    const coupon = await prisma.coupon.create({ data: { code, type, amount: parseFloat(amount), validFrom: validFrom ? new Date(validFrom) : null, validTo: validTo ? new Date(validTo) : null, usageLimit: usageLimit ?? null, usagePerCustomer: usagePerCustomer ?? 1, active: active ?? true } });
    await logAudit({ action: 'create_coupon', resource: coupon.id, data: coupon });
    return NextResponse.json({ success: true, data: coupon });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
