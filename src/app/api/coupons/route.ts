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
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (Number.isNaN(amountNum)) {
      return NextResponse.json({ success: false, error: 'invalid_amount' }, { status: 400 });
    }

    // Prisma espera Date | null. O <input type="date"> manda string 'YYYY-MM-DD'.
    // Se a string vier inválida, new Date(...) vira "Invalid Date" e explode no Prisma.
    const validFromDate = validFrom ? new Date(validFrom) : null;
    const validToDate = validTo ? new Date(validTo) : null;

    if (validFromDate && Number.isNaN(validFromDate.getTime())) {
      return NextResponse.json({ success: false, error: 'invalid_validFrom' }, { status: 400 });
    }
    if (validToDate && Number.isNaN(validToDate.getTime())) {
      return NextResponse.json({ success: false, error: 'invalid_validTo' }, { status: 400 });
    }

    const usageLimitNum = usageLimit === '' || usageLimit === null || usageLimit === undefined ? null : Number(usageLimit);
    const usagePerCustomerNum = usagePerCustomer === '' || usagePerCustomer === null || usagePerCustomer === undefined ? 1 : Number(usagePerCustomer);

    if (usageLimitNum !== null && Number.isNaN(usageLimitNum)) {
      return NextResponse.json({ success: false, error: 'invalid_usageLimit' }, { status: 400 });
    }
    if (Number.isNaN(usagePerCustomerNum)) {
      return NextResponse.json({ success: false, error: 'invalid_usagePerCustomer' }, { status: 400 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code,
        type,
        amount: amountNum,
        validFrom: validFromDate,
        validTo: validToDate,
        usageLimit: usageLimitNum,
        usagePerCustomer: usagePerCustomerNum,
        active: active ?? true,
      },
    });
    await logAudit({ action: 'create_coupon', resource: coupon.id, data: coupon });
    return NextResponse.json({ success: true, data: coupon });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
