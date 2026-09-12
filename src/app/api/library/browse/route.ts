import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";

const PAGE_SIZE = 24;

/**
 * Parcours pagine de la bibliotheque (sans recherche) -- distinct de
 * `GET /api/library?q=` (recherche instantanee, reponse en tableau simple,
 * utilisee aussi par le formulaire d'ajout). Necessaire depuis l'import
 * plantfolio (~1000 profils) : tout charger d'un coup n'est plus raisonnable.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    // Plafond haut (audit security1.md, P3) : sans lui, un `page` absurde
    // forcait quand meme un scan complet de la table (bornee par le nombre
    // reel d'entrees, mais autant l'eviter).
    const page = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1));

    const [entries, total] = await Promise.all([
      db.plantLibraryEntry.findMany({
        orderBy: { commonName: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.plantLibraryEntry.count(),
    ]);

    return NextResponse.json({ entries, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) });
  } catch (error) {
    return handleApiError(error);
  }
}
