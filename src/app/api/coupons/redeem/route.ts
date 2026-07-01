import { NextResponse } from 'next/server';
import { redeemCoupon, findCouponByCode, canRedeem } from '@/lib/coupons';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, clientId, appointmentId } = body;
    if (!code || !clientId) return NextResponse.json({ success: false, error: 'invalid' }, { status: 400 });

    const coupon = await findCouponByCode(code);
    if (!coupon) return NextResponse.json({ success: false, error: 'invalid_code' }, { status: 404 });

    const check = await canRedeem(coupon.id, clientId);
    if (!check.ok) return NextResponse.json({ success: false, error: check.reason }, { status: 400 });

    // create redemption record and optionally compute amountApplied based on coupon.type
    // For percent coupons, caller (e.g. appointment creation) should calculate discount amount.
    const redemption = await prisma.couponRedemption.create({ data: { couponId: coupon.id, clientId, appointmentId: appointmentId ?? null } });
    await logAudit({ action: 'redeem_coupon', resource: coupon.id, data: { clientId, appointmentId, redemptionId: redemption.id } });

    return NextResponse.json({ success: true, data: { coupon, redemption } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
