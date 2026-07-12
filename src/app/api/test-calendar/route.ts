import { NextRequest, NextResponse } from "next/server";
import { generateCalendarImage } from "@/lib/calendar-core";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
  const month = parseInt(searchParams.get("month") || new Date().getMonth().toString());
  
  try {
    const imageUrl = await generateCalendarImage(new Date(year, month));
    return NextResponse.json({ imageUrl, year, month });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
