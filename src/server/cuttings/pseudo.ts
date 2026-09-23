import { db } from "@/server/db";
import { ConflictError } from "@/lib/errors";
import { normalizeForSearch } from "@/lib/textSearch";

/**
 * Forme normalisee servant a l'unicite : sans accents, sans casse, espaces
 * et separateurs ignores -- "Léa", "lea" et "L.e.a" doivent etre
 * indiscernables a l'ecran, donc refuses comme doublons.
 */
export function pseudoKeyOf(pseudo: string): string {
  return normalizeForSearch(pseudo).replace(/[\s._-]+/g, "");
}

export async function getPseudo(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { pseudo: true } });
  return user?.pseudo ?? null;
}

export async function setPseudo(userId: string, pseudo: string): Promise<string> {
  const key = pseudoKeyOf(pseudo);
  const taken = await db.user.findFirst({ where: { pseudoKey: key, id: { not: userId } }, select: { id: true } });
  if (taken) {
    throw new ConflictError("Ce pseudo est déjà pris (ou trop proche d'un pseudo existant).");
  }
  try {
    await db.user.update({ where: { id: userId }, data: { pseudo, pseudoKey: key } });
  } catch (error) {
    // Course entre la verification ci-dessus et l'ecriture : la contrainte
    // unique de pseudoKey a le dernier mot.
    if ((error as { code?: string }).code === "P2002") {
      throw new ConflictError("Ce pseudo est déjà pris (ou trop proche d'un pseudo existant).");
    }
    throw error;
  }
  return pseudo;
}

/** Sans pseudo, un compte ne peut ni publier ni ecrire : personne ne saurait qui est qui. */
export async function requirePseudo(userId: string): Promise<string> {
  const pseudo = await getPseudo(userId);
  if (!pseudo) {
    throw new ConflictError("Choisis d'abord un pseudo pour publier ou écrire aux autres membres.");
  }
  return pseudo;
}
