import { db } from "@/server/db";

/**
 * Recupere en un seul aller-retour la photo de reference de la bibliotheque
 * pour chaque nom scientifique donne -- utilisee comme repli visuel quand
 * une plante personnelle n'a pas encore sa propre photo.
 */
export async function getLibraryImageMap(scientificNames: Array<string | null | undefined>): Promise<Map<string, string>> {
  const names = Array.from(new Set(scientificNames.filter((n): n is string => Boolean(n))));
  if (names.length === 0) return new Map();

  const entries = await db.plantLibraryEntry.findMany({
    where: { scientificName: { in: names } },
    select: { scientificName: true, careProfile: true },
  });

  const map = new Map<string, string>();
  for (const entry of entries) {
    const imageUrl = (entry.careProfile as { imageUrl?: string } | null)?.imageUrl;
    if (imageUrl && entry.scientificName) map.set(entry.scientificName, imageUrl);
  }
  return map;
}
