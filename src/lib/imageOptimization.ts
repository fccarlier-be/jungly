/**
 * Regression connue de Next.js (https://github.com/vercel/next.js/issues/82610,
 * introduite par la PR #82114/#82175) : l'optimiseur d'images (`/_next/image`)
 * fait un fetch interne SANS jamais transmettre les cookies de la requete
 * d'origine. Inoffensif pour une image publique, mais `/uploads/[filename]`
 * exige une session (photo privee d'un utilisateur, voir
 * src/app/uploads/[filename]/route.ts) -- ce fetch echoue donc toujours,
 * et Next.js met l'echec en cache, laissant la photo cassee durablement
 * meme une fois la ressource legitimement accessible. Constate le
 * 2026-09-20 sur une plante fraichement creee via identification par photo.
 *
 * `/library-photos/[filename]` reste optimisable : cette route est
 * volontairement publique (photo de reference partagee, pas de notion
 * d'ownership), donc non affectee par cette regression.
 */
export function bypassesImageOptimizer(url: string): boolean {
  return url.startsWith("http") || url.startsWith("/uploads/");
}
