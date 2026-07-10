const STORE_ADDRESS = "Rua Professor Benedito Loureiro de Lima, 146, Jardim Esplanada, Jundiaí, SP";

export interface DistanceResult {
  distanceKm: number;
  durationMin: number;
}

export async function calculateDistance(clientAddress: string): Promise<DistanceResult | null> {
  const apiKey = process.env.DISTANCEMATRIX_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !clientAddress?.trim()) return null;

  const url = new URL("https://api.distancematrix.ai/maps/api/distancematrix/json");
  url.searchParams.set("origins", STORE_ADDRESS);
  url.searchParams.set("destinations", clientAddress);
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    const element = data?.rows?.[0]?.elements?.[0];

    if (!element || element.status !== "OK") {
      return null;
    }

    return {
      distanceKm: Number((element.distance?.value / 1000).toFixed(2)),
      durationMin: Math.ceil(element.duration?.value / 60),
    };
  } catch (error) {
    console.error("[Maps] Falha ao calcular distância", error);
    return null;
  }
}

export function calculatePickupFee(distanceKm: number, feePerKm: number, feeBase: number): number {
  return Number((feeBase + distanceKm * feePerKm).toFixed(2));
}
