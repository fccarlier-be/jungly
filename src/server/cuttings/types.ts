export const CUTTING_LISTING_TYPES = ["DON", "ECHANGE"] as const;
export type CuttingListingType = (typeof CUTTING_LISTING_TYPES)[number];

export const CUTTING_LISTING_TYPE_LABEL: Record<CuttingListingType, string> = {
  DON: "Don",
  ECHANGE: "Échange",
};

export const CUTTING_LISTING_STATUSES = ["OUVERTE", "RESERVEE", "TERMINEE", "ANNULEE"] as const;
export type CuttingListingStatus = (typeof CUTTING_LISTING_STATUSES)[number];

export const CUTTING_LISTING_STATUS_LABEL: Record<CuttingListingStatus, string> = {
  OUVERTE: "Ouverte",
  RESERVEE: "Réservée",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

export const CUTTING_RATING_MIN = 1;
export const CUTTING_RATING_MAX = 5;

/** Nombre maximal de photos par annonce -- au moins 1 exigee, jamais 0. */
export const MAX_CUTTING_PHOTOS = 5;

/** Nombre maximal de boutures proposables dans UNE annonce. */
export const MAX_CUTTING_QUANTITY = 99;

/**
 * Regle fondamentale du don/echange, rappelee partout ou elle compte
 * (formulaire de publication, page Boutures, messagerie) : l'outil ne doit
 * jamais etre detourne en place de marche (exigence produit explicite).
 */
export const CUTTINGS_NO_SALE_RULE =
  "Les boutures se donnent ou s'échangent, jamais contre de l'argent. Toute vente est interdite.";

export const CUTTING_REPORT_REASONS = ["VENTE", "COMPORTEMENT", "AUTRE"] as const;
export type CuttingReportReason = (typeof CUTTING_REPORT_REASONS)[number];

export const CUTTING_REPORT_REASON_LABEL: Record<CuttingReportReason, string> = {
  VENTE: "Tentative de vente contre de l'argent",
  COMPORTEMENT: "Comportement inapproprié",
  AUTRE: "Autre",
};

/**
 * Detection GROSSIERE d'un prix dans le texte d'une annonce (montant + devise,
 * ou vocabulaire de vente) -- un garde-fou, pas une garantie : elle bloque le
 * cas evident a la publication, le signalement couvre le reste. Volontairement
 * limitee a l'annonce (titre/description), jamais appliquee aux messages
 * prives ou "20 cm" ou "2 euros de terreau" restent des phrases legitimes.
 */
const PRICE_PATTERN =
  /\d\s*(?:€|eur(?:os?)?(?![\p{L}]))|(?:€|(?<![\p{L}])euros?(?![\p{L}]))\s*\d|(?<![\p{L}])(?:prix|tarif|payante?s?|vendue?s?|je vends|(?:à|a) vendre)(?![\p{L}])/iu;

export function mentionsPrice(text: string): boolean {
  return PRICE_PATTERN.test(text);
}

// ---------------------------------------------------------------------------
// Avertissements et suspensions (voir CuttingWarning, moderation.ts)
// ---------------------------------------------------------------------------

/** Nombre d'avertissements par palier : chaque multiple de 3 declenche une sanction, de plus en plus lourde. */
export const WARNINGS_PER_TIER = 3;

export const CUTTING_WARNING_CONSEQUENCES = ["NONE", "BAN_WEEK", "BAN_MONTH", "BAN_PERMANENT"] as const;
export type CuttingWarningConsequence = (typeof CUTTING_WARNING_CONSEQUENCES)[number];

export const CUTTING_CONSEQUENCE_LABEL: Record<CuttingWarningConsequence, string> = {
  NONE: "Aucune sanction pour l'instant",
  BAN_WEEK: "Suspension d'une semaine du don/échange de boutures",
  BAN_MONTH: "Suspension d'un mois du don/échange de boutures",
  BAN_PERMANENT: "Bannissement définitif de l'application",
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const BAN_DURATION_MS: Record<"BAN_WEEK" | "BAN_MONTH", number> = {
  BAN_WEEK: 7 * DAY_MS,
  BAN_MONTH: 30 * DAY_MS,
};

/**
 * Sanction attachee au N-ieme avertissement recu (cumul sur la vie du
 * compte) : 3e = 1 semaine, 6e = 1 mois, 9e = bannissement definitif de
 * l'app entiere ; les autres rangs n'ont aucune sanction automatique.
 */
export function consequenceForRank(rank: number): CuttingWarningConsequence {
  if (rank % WARNINGS_PER_TIER !== 0) return "NONE";
  const tier = rank / WARNINGS_PER_TIER;
  if (tier === 1) return "BAN_WEEK";
  if (tier === 2) return "BAN_MONTH";
  return "BAN_PERMANENT";
}
