/**
 * "open" (defaut) : inscription libre-service -- y compris sur l'offre
 * hebergee depuis l'introduction du palier gratuit (voir
 * lib/features.ts, freePlantLimit()) : un compte libre reste utilisable
 * jusqu'a 5 plantes, l'achat (POST /api/billing/upgrade) ne fait que
 * debloquer un compte deja cree, il ne le cree plus. "invite_only" :
 * coupe ce formulaire public, reserve a une periode ou l'inscription
 * libre ne doit pas etre proposee (ex. avant le lancement public).
 */
export function isRegistrationOpen(): boolean {
  return process.env.REGISTRATION_MODE !== "invite_only";
}
