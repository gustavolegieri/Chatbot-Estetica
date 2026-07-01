import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const c = await prisma.coupon.findUnique({ where: { id } });
    await prisma.coupon.delete({ where: { id } });
    await logAudit({ action: 'delete_coupon', resource: id, data: c });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { code, type, amount, validFrom, validTo, usageLimit, usagePerCustomer, active } = body;
    const coupon = await prisma.coupon.update({ where: { id }, data: { code, type, amount: parseFloat(amount), validFrom: validFrom ? new Date(validFrom) : null, validTo: validTo ? new Date(validTo) : null, usageLimit: usageLimit ?? null, usagePerCustomer: usagePerCustomer ?? 1, active: active ?? true } });
    await logAudit({ action: 'update_coupon', resource: id, data: coupon });
    return NextResponse.json({ success: true, data: coupon });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
