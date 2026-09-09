import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUserId } from "@/lib/session";
import { handleApiError } from "@/lib/apiError";
import { db } from "@/server/db";
import { getExternalDetails } from "@/server/externalSpecies/providers";

const importSchema = z.object({ source: z.enum(["OPENPLANTBOOK", "PERENUAL"]), sourceId: z.string().min(1) });

/**
 * Importe une espece externe dans la bibliotheque locale. Re-interroge la
 * source cote serveur plutot que de faire confiance a un payload client (on
 * ne stocke que ce que l'API source renvoie reellement). Idempotent :
 * reimporter la meme espece met a jour la fiche existante au lieu d'en
 * creer une deuxieme (@@unique([source, sourceId])).
 */
export async function POST(request: NextRequest) {
  try {
    await requireUserId();
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
