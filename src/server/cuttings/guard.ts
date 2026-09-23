import { requireUserId } from "@/lib/session";
import { assertCuttingsMarketplaceEnabled } from "@/server/cuttings/service";
import { assertCuttingsAccess } from "@/server/cuttings/access";

/**
 * Point d'entree unique des routes API du don/echange : fonctionnalite active
 * sur cette instance, session valide (compte non desactive, voir
 * requireUserId) ET membre non suspendu. Un compte banni definitivement est
 * deja rejete par requireUserId (User.disabledAt).
 *
 * Fichier a part de access.ts : requireUserId tire next-auth/next/server,
 * ce qui empecherait de tester access.ts directement sous Vitest (meme
 * raison que lib/errors.ts).
 */
export async function requireCuttingsUserId(): Promise<string> {
  assertCuttingsMarketplaceEnabled();
  const userId = await requireUserId();
  await assertCuttingsAccess(userId);
  return userId;
}
