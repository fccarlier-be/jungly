import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@generated/prisma/client";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/server/db";
import { getExternalDetails } from "@/server/externalSpecies/providers";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { mirrorLibraryImage } from "@/server/libraryPhotos";

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

    // Mirroir local de la photo (voir libraryPhotos.ts) : sans ca, chaque
    // affichage de /bibliotheque re-televerse l'image depuis la source
    // externe indefiniment. Reimporter (idempotent, ex. depuis
    // ExternalSpeciesSearch) ne re-telecharge pas si la source de l'image
    // n'a pas change depuis le dernier import/resync -- reutilise alors le
    // mirroir deja stocke plutot que d'en creer un nouveau orphelin.
    const existing = await db.plantLibraryEntry.findUnique({ where: { source_sourceId: { source, sourceId } } });
    const existingCareProfile = existing?.careProfile as { imageUrl?: string } | null;
    let imageUrl = details.careProfile.imageUrl;
    if (details.image.imageUrl) {
      if (existing?.imageSourceUrl === details.image.imageSourceUrl && existingCareProfile?.imageUrl) {
        imageUrl = existingCareProfile.imageUrl;
      } else {
        imageUrl = (await mirrorLibraryImage(details.image.imageUrl)) ?? details.image.imageUrl;
      }
    }

    const data = {
      commonName: details.commonName,
      scientificName: details.scientificName,
      family: details.family,
      careProfile: { ...details.careProfile, imageUrl } as unknown as Prisma.InputJsonValue,
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
