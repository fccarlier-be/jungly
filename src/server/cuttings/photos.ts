import { db } from "@/server/db";

// Noms generes par processAndStoreUpload (randomUUID + ".jpg") -- ce garde-fou
// strict evite que le motif LIKE ci-dessous soit jamais construit a partir
// d'un nom arbitraire (caracteres % ou _ interpretes par LIKE).
const UPLOAD_URL_PATTERN = /^\/uploads\/[0-9a-f-]{36}\.jpg$/;

/**
 * Vrai si cette photo televersee est rattachee a une annonce de boutures --
 * ces photos doivent etre visibles par TOUS les comptes connectes (c'est
 * tout l'objet d'une annonce), contrairement aux autres fichiers de /uploads
 * reserves a leur proprietaire (voir app/uploads/[filename]/route.ts).
 * photoUrls est un champ Json : SQLite n'offre pas de filtre "tableau
 * contient" via Prisma, d'ou la requete brute.
 */
export async function isCuttingListingPhoto(url: string): Promise<boolean> {
  if (!UPLOAD_URL_PATTERN.test(url)) return false;
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM "CuttingListing" WHERE "photoUrls" LIKE ${`%${url}%`} LIMIT 1`;
  return rows.length > 0;
}
