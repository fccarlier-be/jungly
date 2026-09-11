import { NextResponse } from "next/server";
import { Prisma } from "@generated/prisma/client";
import { requireAdminUserId } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/apiError";
import { db } from "@/server/db";
import { getExternalDetails } from "@/server/externalSpecies/providers";
import type { ExternalSource } from "@/server/externalSpecies/types";
import { mirrorLibraryImage } from "@/server/libraryPhotos";

type Params = { params: Promise<{ id: string }> };

const EXTERNAL_SOURCES: ExternalSource[] = ["OPENPLANTBOOK", "PERENUAL"];

/**
 * Resynchronise une fiche deja importee avec sa source externe (met a jour
 * `lastSyncedAt`). N'affecte jamais les plantes des utilisateurs qui
 * referencent cette fiche : leurs regles/champs ont ete copies une fois a
 * l'ajout, ils ne sont pas lus en direct depuis la bibliotheque.
 *
 * Reserve a l'administrateur : PlantLibraryEntry est une table GLOBALE
 * partagee par tous les comptes -- sans cette restriction, n'importe quel
 * utilisateur connecte pouvait modifier ce que voient tous les autres.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    await requireAdminUserId();
    const { id } = await params;

    const entry = await db.plantLibraryEntry.findUnique({ where: { id } });
    if (!entry || !entry.sourceId || !EXTERNAL_SOURCES.includes(entry.source as ExternalSource)) {
      throw new NotFoundError("Cette fiche n'est pas liee a une source externe.");
    }

    const details = await getExternalDetails(entry.source as ExternalSource, entry.sourceId);

    // Mirroir local de la photo (voir libraryPhotos.ts, meme logique qu'a
    // l'import) : ne re-telecharge que si la source de l'image a change
    // depuis le dernier sync, reutilise sinon le mirroir deja stocke.
    const existingCareProfile = entry.careProfile as { imageUrl?: string } | null;
    let imageUrl = details.careProfile.imageUrl;
    if (details.image.imageUrl) {
      if (entry.imageSourceUrl === details.image.imageSourceUrl && existingCareProfile?.imageUrl) {
        imageUrl = existingCareProfile.imageUrl;
      } else {
        imageUrl = (await mirrorLibraryImage(details.image.imageUrl)) ?? details.image.imageUrl;
      }
    }

    const updated = await db.plantLibraryEntry.update({
      where: { id },
      data: {
        commonName: details.commonName || entry.commonName,
        scientificName: details.scientificName ?? entry.scientificName,
        family: details.family ?? entry.family,
        careProfile: { ...details.careProfile, imageUrl } as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
        imageSourceUrl: details.image.imageSourceUrl,
        imageLicense: details.image.imageLicense,
        imageLicenseUrl: details.image.imageLicenseUrl,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
