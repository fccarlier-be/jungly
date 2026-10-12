/**
 * Fonctionnalites reservees a l'instance hebergee (variables d'env posees
 * uniquement sur ce conteneur, voir docker-compose.yml) -- le code reste
 * commun aux deux instances, seule leur configuration differe.
 */

// Le don/echange de boutures n'a de sens qu'entre comptes qui peuvent se
// rencontrer physiquement : impossible sur une instance auto-hebergee
// (mono-foyer par nature), reserve donc a l'instance hebergee multi-comptes
// (voir la discussion produit du 2026-09-23).
export function isCuttingsMarketplaceEnabled(): boolean {
  return process.env.ENABLE_CUTTINGS_MARKETPLACE === "true";
}

/**
 * Nombre de plantes au-dela duquel un compte sans achat (hasUnlimitedAccess)
 * doit debloquer l'offre illimitee -- voir server/planLimit.ts. Absente
 * (null) : aucun palier, comme sur une instance auto-hebergee ou tant que
 * la variable n'est pas posee.
 */
export function freePlantLimit(): number | null {
  const raw = process.env.HOSTED_FREE_PLANT_LIMIT;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
