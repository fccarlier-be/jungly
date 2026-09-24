import type { Prisma } from "@generated/prisma/client";

type LibraryEntryRef = {
  source: string;
  sourceId?: string | null;
  commonName: string;
  scientificName?: string | null;
};

/**
 * Retrouve, sur CE serveur, la fiche de bibliotheque designee par une
 * sauvegarde. Les ids different d'une instance a l'autre : une fiche importee
 * (OpenPlantbook, Plantfolio...) se retrouve par (source, sourceId), une fiche
 * LOCAL (saisie a la main, sans sourceId) par source + noms.
 */
export async function findLibraryEntryId(
  client: Pick<Prisma.TransactionClient, "plantLibraryEntry">,
  ref: LibraryEntryRef,
): Promise<string | null> {
  if (ref.sourceId) {
    const entry = await client.plantLibraryEntry.findUnique({
      where: { source_sourceId: { source: ref.source, sourceId: ref.sourceId } },
      select: { id: true },
    });
    return entry?.id ?? null;
  }
  const entry = await client.plantLibraryEntry.findFirst({
    where: { source: ref.source, commonName: ref.commonName, scientificName: ref.scientificName ?? null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return entry?.id ?? null;
}
