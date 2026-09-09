import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/server/db";
import { getExternalDetails } from "@/server/externalSpecies/providers";
import type { ExternalSource } from "@/server/externalSpecies/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Apercu d'une espece externe avant import (l'utilisateur voit la fiche
 * mappee, avec la source/licence de l'image, avant de decider de l'ajouter
 * a la bibliotheque). N'ecrit rien en base.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireUserId();
    const { id } = await params;
    const source = (request.nextUrl.searchParams.get("source") as ExternalSource) || "PERENUAL";

    const existing = await db.plantLibraryEntry.findUnique({ where: { source_sourceId: { source, sourceId: id } } });
    const details = await getExternalDetails(source, id);

    return NextResponse.json({ ...details, alreadyImported: Boolean(existing) });
  } catch (error) {
    return handleApiError(error);
  }
}
