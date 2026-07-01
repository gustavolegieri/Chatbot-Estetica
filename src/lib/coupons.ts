import { prisma } from './prisma';

export async function findCouponByCode(code: string) {
  return prisma.coupon.findUnique({ where: { code } });
}

export async function canRedeem(couponId: string, clientId: string) {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon || !coupon.active) return { ok: false, reason: 'not_found_or_inactive' };
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) return { ok: false, reason: 'not_started' };
  if (coupon.validTo && coupon.validTo < now) return { ok: false, reason: 'expired' };

  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
    const totalUsed = await prisma.couponRedemption.count({ where: { couponId } });
    if (totalUsed >= coupon.usageLimit) return { ok: false, reason: 'usage_limit_reached' };
  }

  if (coupon.usagePerCustomer !== null && coupon.usagePerCustomer !== undefined) {
    const usedByClient = await prisma.couponRedemption.count({ where: { couponId, clientId } });
    if (usedByClient >= coupon.usagePerCustomer) return { ok: false, reason: 'client_usage_limit' };
  }

  return { ok: true, coupon };
}

export async function redeemCoupon(code: string, clientId: string, appointmentId?: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) return { success: false, error: 'invalid_code' };

  const check = await canRedeem(coupon.id, clientId);
  if (!check.ok) return { success: false, error: check.reason };

  // compute applied amount (for percent type)
  let applied = null;
  if (coupon.type === 'percent') {
    // caller should compute based on service price; we'll store null placeholder
    applied = null;
  } else {
    applied = coupon.amount;
  }

  const redemption = await prisma.couponRedemption.create({ data: { couponId: coupon.id, clientId, appointmentId, amountApplied: applied } });

  return { success: true, data: { redemption, coupon } };
}
