import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { geocodeCity } from "@/server/weather/client";

/** Proxy serveur vers Open-Meteo (evite d'exposer/appeler l'API externe cote client). */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }
    const results = await geocodeCity(q);
    return NextResponse.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
