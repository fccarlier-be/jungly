import { db } from "@/server/db";
import { PlanLimitError } from "@/lib/errors";
import { freePlantLimit } from "@/lib/features";

/**
 * Etat du palier gratuit pour un compte -- utilise par /api/billing/status
 * (Parametres) et par le paywall cote client. `limit` null = pas de palier
 * sur cette instance (auto-hebergee), le reste des champs n'a alors aucun
 * sens et n'est pas utilise.
 */
export interface PlanStatus {
  limit: number | null;
  plantCount: number;
  hasUnlimitedAccess: boolean;
}

export async function getPlanStatus(userId: string): Promise<PlanStatus> {
  const limit = freePlantLimit();
  const [user, plantCount] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { hasUnlimitedAccess: true } }),
    db.plant.count({ where: { userId } }),
  ]);
  return { limit, plantCount, hasUnlimitedAccess: user.hasUnlimitedAccess };
}

/**
 * A appeler avant de creer une plante (voir POST /api/plants) : leve
 * PlanLimitError si le compte a deja atteint le palier gratuit de cette
 * instance et n'a pas debloque l'offre illimitee. No-op immediat sur une
 * instance sans palier (freePlantLimit() absente) -- pas de requete DB
 * supplementaire dans ce cas, le chemin le plus courant (auto-heberge).
 */
export async function assertCanCreatePlant(userId: string): Promise<void> {
  const limit = freePlantLimit();
  if (limit == null) return;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { hasUnlimitedAccess: true } });
  if (user.hasUnlimitedAccess) return;

  const count = await db.plant.count({ where: { userId } });
  if (count >= limit) {
    throw new PlanLimitError(limit);
  }
}
