import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";
const photoCache = new Map<string, { url: string | null; expiresAt: number }>();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const phone = normalizePhone(decodeURIComponent((await params).phone));
  const cached = photoCache.get(phone);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, data: { url: cached.url, cached: true } });
  }

  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ success: true, data: { url: null, configured: false } });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_500);
    const response = await fetch(`${WASENDER_BASE}/contacts/${encodeURIComponent(phone)}/picture`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => null);
    const url = response.ok && typeof payload?.data?.imgUrl === "string" ? payload.data.imgUrl : null;
    photoCache.set(phone, { url, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return NextResponse.json({ success: true, data: { url } });
  } catch {
    return NextResponse.json({ success: true, data: { url: null } });
  }
}
