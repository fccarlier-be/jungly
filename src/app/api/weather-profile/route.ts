import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { setWeatherProfileSchema } from "@/server/validation/weather";
import { refreshWeatherProfile } from "@/server/weather/refresh";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await db.weatherProfile.findUnique({ where: { userId } });
    return NextResponse.json(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Cree ou change la ville. Ecrase toujours l'ancien profil (une seule ville a la fois). */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const input = setWeatherProfileSchema.parse(body);

    const profile = await db.weatherProfile.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });

    // Rafraichissement immediat : l'utilisateur doit voir l'ajustement tout
    // de suite, pas attendre le prochain passage quotidien du scheduler. Si
    // Open-Meteo est indisponible, le profil reste quand meme enregistre
    // (multiplicateur par defaut a 1 en attendant demain).
    try {
      await refreshWeatherProfile(profile);
    } catch (error) {
      console.error(`[weather] rafraîchissement immédiat échoué pour l'utilisateur ${userId} :`, error);
    }

    const updated = await db.weatherProfile.findUniqueOrThrow({ where: { userId } });
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await db.weatherProfile.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
