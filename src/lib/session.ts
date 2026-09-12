import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

// Re-exportee pour compatibilite -- la definition vit desormais dans
// errors.ts (voir ce fichier pour le detail).
export { UnauthorizedError };

/**
 * À utiliser dans les route handlers API : lève UnauthorizedError si non
 * connecté. Verifie aussi que le compte existe toujours : un JWT reste
 * valide jusqu'a 30 jours (session strategy "jwt", voir auth.ts)
 * independamment d'une suppression de compte entre-temps -- sans cette
 * verification, un ancien token continuait a passer requireUserId() apres
 * DELETE /api/user (audit security1.md, P2).
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  if (!user) {
    throw new UnauthorizedError();
  }
  return session.user.id;
}

/**
 * Comme requireUserId, mais leve en plus ForbiddenError si le compte n'est
 * pas administrateur -- reserve les actions affectant des donnees globales
 * partagees entre tous les utilisateurs (ex. resync de bibliotheque).
 */
export async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId();
  const user = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) {
    throw new ForbiddenError("Action réservée à l'administrateur.");
  }
  return userId;
}

/**
 * À utiliser dans les Server Components (pages) : redirige vers /login si
 * non connecté, au lieu de planter sur un session!.user.id. Le middleware
 * fait déjà ce filtrage en amont, mais on ne s'y fie jamais entièrement
 * (défense en profondeur).
 */
export async function requireSessionUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  if (!user) {
    redirect("/login");
  }
  return session.user.id;
}
