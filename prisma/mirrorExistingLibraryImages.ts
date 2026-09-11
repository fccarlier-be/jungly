/**
 * Script de rattrapage ponctuel : mirrore localement les photos de
 * bibliotheque encore hotlinkees depuis un hote externe -- entrees peuplees
 * avant l'introduction du mirroring (voir libraryPhotos.ts), par un
 * seed.ts/backfillImages.ts anterieur a leur propre correctif, ou par toute
 * autre voie ayant echappe au mirroring habituel.
 *
 * Idempotent et sans risque a relancer : ne retouche que les entrees dont
 * careProfile.imageUrl commence encore par http(s) (jamais celles deja
 * mirrorees), et conserve l'URL externe d'origine si le telechargement
 * echoue pour une entree donnee (best-effort, comme partout ailleurs dans
 * le mirroring -- une source tierce temporairement indisponible ne doit pas
 * faire echouer tout le lot).
 *
 * A relancer manuellement (`npx tsx prisma/mirrorExistingLibraryImages.ts`)
 * si de nouvelles entrees hotlinkees apparaissent (import manuel de donnees,
 * restauration d'une sauvegarde anterieure a ce correctif...).
 */
import { Prisma } from "@generated/prisma/client";
import { mirrorLibraryImage } from "../src/server/libraryPhotos";
import { db } from "../src/server/db";

// Simple telechargement d'une image deja connue (pas de recherche API a
// respecter, contrairement a backfillImages.ts) : quelques requetes en
// parallele restent courtoises envers les hebergeurs concernes, tout en
// restant nettement plus rapide qu'un traitement strictement sequentiel sur
// environ un millier de fiches.
const CONCURRENCY = 5;

interface Target {
  id: string;
  careProfile: Record<string, unknown> & { imageUrl?: string };
}

async function mirrorOne(entry: Target): Promise<"mirrored" | "failed"> {
  const mirrored = await mirrorLibraryImage(entry.careProfile.imageUrl!);
  if (!mirrored) return "failed";
  await db.plantLibraryEntry.update({
    where: { id: entry.id },
    data: { careProfile: { ...entry.careProfile, imageUrl: mirrored } as unknown as Prisma.InputJsonValue },
  });
  return "mirrored";
}

async function main() {
  const entries = await db.plantLibraryEntry.findMany({ select: { id: true, careProfile: true } });
  const targets: Target[] = entries
    .map((e) => ({ id: e.id, careProfile: e.careProfile as Record<string, unknown> & { imageUrl?: string } }))
    .filter((e) => e.careProfile?.imageUrl?.startsWith("http"));

  console.log(`${targets.length} fiche(s) avec une image encore externe sur ${entries.length} au total.`);

  let done = 0;
  let mirrored = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const entry = targets[cursor++];
      if (!entry) return;
      try {
        const result = await mirrorOne(entry);
        if (result === "mirrored") mirrored += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        console.error(`Erreur pour ${entry.id} :`, error instanceof Error ? error.message : error);
      }
      done += 1;
      if (done % 50 === 0) {
        console.log(`... ${done}/${targets.length} traitées (${mirrored} mirrorées, ${failed} échecs jusqu'ici).`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Terminé : ${mirrored} image(s) mirrorée(s), ${failed} échec(s) (URL externe conservée) sur ${targets.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
