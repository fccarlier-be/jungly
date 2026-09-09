import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { searchExternal } from "@/server/externalSpecies/providers";

/**
 * Recherche externe (OpenPlantbook en premier, Perenual en repli) -- a
 * n'appeler qu'a la demande explicite de l'utilisateur (bouton "Rechercher
 * en ligne"), jamais automatiquement : la recherche locale (`/api/library`,
 * ~1000 profils) reste la premiere etape, instantanee et sans dependance
 * reseau.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ source: null, results: [] });
    }

    const { source, results } = await searchExternal(q);
    return NextResponse.json({ source, results });
  } catch (error) {
    return handleApiError(error);
  }
}
