import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" }
    });

    return NextResponse.json({
      whatsappEnabled: settings?.whatsappEnabled ?? false,
      testModeEnabled: settings?.testModeEnabled ?? false,
      testModePhone: settings?.testModePhone
    });
  } catch (error) {
    return NextResponse.json({
      whatsappEnabled: false,
      testModeEnabled: false,
      error: (error as Error).message
    });
  }
}