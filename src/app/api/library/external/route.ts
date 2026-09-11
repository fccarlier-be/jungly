import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { searchExternal } from "@/server/externalSpecies/providers";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * Recherche externe (OpenPlantbook en premier, Perenual en repli) -- a
 * n'appeler qu'a la demande explicite de l'utilisateur (bouton "Rechercher
 * en ligne"), jamais automatiquement : la recherche locale (`/api/library`,
 * ~1000 profils) reste la premiere etape, instantanee et sans dependance
 * reseau.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();

    // Protege le quota gratuit des APIs tierces (Perenual : 100
    // requetes/jour) d'une boucle cote client ou d'un usage abusif.
    const { allowed, retryAfterSeconds } = checkRateLimit(`library-search:${userId}`, 20, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const q = request.nextUrl.searchParams.get("q")?.trim();
    // La borne haute evite de transmettre une chaine arbitrairement longue a
    // OpenPlantbook/Perenual sans aucun benefice (audit14.md, #12).
    if (!q || q.length < 2 || q.length > 120) {
      return NextResponse.json({ source: null, results: [] });
    }

    const { source, results } = await searchExternal(q);
    return NextResponse.json({ source, results });
  } catch (error) {
    return handleApiError(error);
  }
}
