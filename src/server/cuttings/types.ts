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
