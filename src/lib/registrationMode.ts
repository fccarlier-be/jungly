/**
 * "open" (defaut) : inscription libre-service, comme sur une instance
 * auto-hebergee classique. "invite_only" : reserve a une instance hebergee
 * par nous (ex. app.jungly.fcold.org) ou la creation de compte ne doit
 * passer que par un achat verifie (voir POST /api/billing/verify-purchase,
 * a venir) -- jamais par ce formulaire public.
 */
export function isRegistrationOpen(): boolean {
  return process.env.REGISTRATION_MODE !== "invite_only";
}
