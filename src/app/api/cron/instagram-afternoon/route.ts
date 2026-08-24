import { NextRequest } from "next/server";
import { handleInstagramSlotCron } from "@/lib/instagram-cron-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleInstagramSlotCron(request, "tarde");
}
