import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { normalizeForSearch } from "@/lib/textSearch";

/**
 * Recherche dans la bibliothèque de plantes. Nécessite d'être connecté
 * (comme le reste de l'app) mais n'est pas propre à un utilisateur -- la
 * bibliothèque est partagée/commune.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    const q = request.nextUrl.searchParams.get("q")?.trim();

    // Meme raisonnement que /api/library/external et /api/weather/geocode
    // (audit14.md #12, audit security1.md P3) : pas de benefice a traiter
    // une chaine arbitrairement longue, meme pour une recherche locale.
    if (!q || q.length < 2 || q.length > 120) {
      return NextResponse.json([]);
    }

    // Filtre en memoire (pas de `where` SQL) : SQLite `contains` ignore la
    // casse ASCII mais pas les accents ("orchidee" ne matchait jamais
    // "Orchidée") -- voir normalizeForSearch. La bibliotheque reste de
    // taille modeste (quelques milliers de lignes au plus), un aller-retour
    // complet est instantane.
    const normalizedQuery = normalizeForSearch(q);
    const allEntries = await db.plantLibraryEntry.findMany({ orderBy: { commonName: "asc" } });
    const entries = allEntries
      .filter(
        (e) =>
          normalizeForSearch(e.commonName).includes(normalizedQuery) ||
          (e.scientificName && normalizeForSearch(e.scientificName).includes(normalizedQuery)),
      )
      .slice(0, 20);

    return NextResponse.json(entries);
  } catch (error) {
    return handleApiError(error);
  }
}
