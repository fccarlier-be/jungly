import { timingSafeEqual } from "crypto";

/**
 * Authentification par secret partage pour les routes /api/internal/* --
 * appelees par jungly-admin (service separe, voir docs/admin-panel.md), pas
 * par un navigateur : pas de session utilisateur possible ni souhaitable ici
 * (jungly-admin n'a pas de compte Jungly propre). Meme motif que
 * X-Sensor-Key pour les capteurs, secret unique partage plutot qu'un par
 * appelant puisqu'il n'y a qu'un seul appelant legitime.
 */
export function hasValidInternalSecret(request: Request): boolean {
  const expected = process.env.JUNGLY_ADMIN_INTERNAL_SECRET;
  const provided = request.headers.get("x-internal-secret");
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // Longueurs differentes : timingSafeEqual leverait, jamais un compte-rendu
  // de timing exploitable puisqu'on rejette avant tout calcul dependant du secret.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
