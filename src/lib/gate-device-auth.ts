import crypto from "node:crypto";
import type { NextRequest } from "next/server";

function timingSafeToken(provided: string, configured: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(configured);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function gateDeviceAuthorized(request: NextRequest) {
  const configured = process.env.GATE_VISION_DEVICE_TOKEN?.trim();
  if (!configured) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const custom = request.headers.get("x-gate-vision-token")?.trim();
  const provided = custom || bearer || "";
  return Boolean(provided && timingSafeToken(provided, configured));
}
