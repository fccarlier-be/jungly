/**
 * Classes d'erreur metier, sans aucune dependance sur next/server -- a la
 * difference de apiError.ts (qui les re-exporte pour compatibilite), ce
 * fichier peut etre importe par un module teste directement sous Node/
 * Vitest sans faire echouer la resolution de "next/server" (module oriente
 * runtime Next.js, absent en dehors du build/dev Next -- voir
 * __tests__/imageMirror.integration.test.ts, premier test a avoir declenche
 * ce probleme via src/server/uploads.ts).
 */

export class NotFoundError extends Error {
  constructor(message = "Ressource introuvable.") {
    super(message);
  }
}

/** Action refusee a cause de l'etat actuel de la ressource (ex. tache deja completee). */
export class ConflictError extends Error {
  constructor(message = "Cette action n'est plus possible dans l'état actuel.") {
    super(message);
  }
}

/** Ressource existante et son id connu de l'appelant, mais action reservee (ex. administration). */
export class ForbiddenError extends Error {
  constructor(message = "Action non autorisée.") {
    super(message);
  }
}

/** Requête bien formée mais dont le contenu viole une contrainte métier hors du schéma Zod (ex. limite de taille détectée après décompression). */
export class BadRequestError extends Error {
  constructor(message = "Requête invalide.") {
    super(message);
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Non authentifié.");
  }
}
