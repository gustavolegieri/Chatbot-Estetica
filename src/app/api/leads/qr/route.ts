import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";

const allowedSources = new Set(["instagram", "google", "indicacao", "parceiro", "pagina-jundiai"]);

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const requestedSource = request.nextUrl.searchParams.get("source") || "pagina-jundiai";
  const source = allowedSources.has(requestedSource) ? requestedSource : "pagina-jundiai";
  const destination = `${request.nextUrl.origin}/jundiai?origem=${encodeURIComponent(source)}`;
  const png = await QRCode.toBuffer(destination, {
    type: "png",
    width: 900,
    margin: 3,
    color: { dark: "#111111", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="garagem-do-ka-${source}.png"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
