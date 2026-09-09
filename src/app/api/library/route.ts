import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";

/**
 * Recherche dans la bibliothèque de plantes. Nécessite d'être connecté
 * (comme le reste de l'app) mais n'est pas propre à un utilisateur -- la
 * bibliothèque est partagée/commune.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUserId();
    const q = request.nextUrl.searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    const entries = await db.plantLibraryEntry.findMany({
      where: {
        OR: [
          { commonName: { contains: q } },
          { scientificName: { contains: q } },
        ],
      },
      orderBy: { commonName: "asc" },
      take: 20,
    });

    return NextResponse.json(entries);
  } catch (error) {
    return handleApiError(error);
  }
}
