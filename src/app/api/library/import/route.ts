import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@generated/prisma/client";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/server/db";
import { getExternalDetails } from "@/server/externalSpecies/providers";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

const importSchema = z.object({ source: z.enum(["OPENPLANTBOOK", "PERENUAL"]), sourceId: z.string().min(1) });

/**
 * Importe une espece externe dans la bibliotheque locale -- reservee a
 * l'admin (PlantLibraryEntry est une table GLOBALE partagee par tous les
 * comptes, meme motif que /resync). Un compte normal garde la recherche/
 * l'apercu externe, mais utilise les donnees localement pour pre-remplir sa
 * propre plante sans jamais ecrire ici (voir ExternalSpeciesSearch.tsx).
 * Re-interroge la source cote serveur plutot que de faire confiance a un
 * payload client (on ne stocke que ce que l'API source renvoie reellement).
 * Idempotent : reimporter la meme espece met a jour la fiche existante au
 * lieu d'en creer une deuxieme (@@unique([source, sourceId])).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAdminUserId();

    const { allowed, retryAfterSeconds } = checkRateLimit(`library-import:${userId}`, 20, 5 * 60 * 1000);
    if (!allowed) {
      return rateLimitResponse(retryAfterSeconds);
    }

    const { source, sourceId } = importSchema.parse(await request.json());

    const details = await getExternalDetails(source, sourceId);
    const now = new Date();

    const data = {
      commonName: details.commonName,
      scientificName: details.scientificName,
      family: details.family,
      careProfile: details.careProfile as unknown as Prisma.InputJsonValue,
      source,
      sourceId,
      lastSyncedAt: now,
      imageSourceUrl: details.image.imageSourceUrl,
      imageLicense: details.image.imageLicense,
      imageLicenseUrl: details.image.imageLicenseUrl,
    };

    const entry = await db.plantLibraryEntry.upsert({
      where: { source_sourceId: { source, sourceId } },
      update: data,
      create: { ...data, importedAt: now },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
