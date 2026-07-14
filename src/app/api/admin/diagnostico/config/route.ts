import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const hasApiKey = !!process.env.WASENDER_API_KEY;
  const baseUrl = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

  return NextResponse.json({
    hasApiKey,
    baseUrl,
    hasBaseUrl: !!process.env.WASENDER_BASE_URL
  });
}