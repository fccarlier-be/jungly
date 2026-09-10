import { PrismaClient } from "@prisma/client";

/**
 * Client Prisma independant (pas celui de src/server/db.ts) pointe sur le
 * meme fichier SQLite que l'instance testee -- utilise uniquement pour
 * nettoyer les donnees creees par les tests E2E (comptes/plantes marques
 * d'un prefixe distinctif), jamais pour piloter l'app elle-meme.
 */
export const cleanupDb = new PrismaClient();

export const E2E_MARKER = "__E2E_TEST__";

/** A appeler dans un afterAll : filet de securite si le nettoyage via l'UI a echoue en cours de test. */
export async function cleanupE2eData() {
  await cleanupDb.plant.deleteMany({ where: { name: { contains: E2E_MARKER } } });
  await cleanupDb.user.deleteMany({ where: { email: { contains: "e2e-test-" } } });
}
