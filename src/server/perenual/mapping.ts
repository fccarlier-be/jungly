import type { PerenualSpeciesDetails, PerenualSpeciesListItem } from "./client";

export interface ExternalSpeciesPreview {
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  thumbnailUrl: string | null;
}

export interface MappedCareProfile {
  exposure?: string;
  humidity?: string;
  toxicity?: string;
  tips?: string;
  imageUrl?: string;
  careLevel?: string;
  watering?: { recurrenceType: "FIXED_INTERVAL_DAYS"; interval: number };
}

export interface MappedImageMeta {
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
}

function firstScientificName(item: PerenualSpeciesListItem): string | null {
  return item.scientific_name?.[0]?.trim() || null;
}

export function toPreview(item: PerenualSpeciesListItem): ExternalSpeciesPreview {
  return {
    sourceId: String(item.id),
    commonName: item.common_name?.trim() || firstScientificName(item) || "Espece sans nom",
    scientificName: firstScientificName(item),
    family: item.family ?? null,
    thumbnailUrl: item.default_image?.thumbnail || item.default_image?.small_url || null,
  };
}

export function mapImage(item: PerenualSpeciesListItem): MappedImageMeta {
  const image = item.default_image;
  if (!image) return { imageUrl: null, imageSourceUrl: null, imageLicense: null, imageLicenseUrl: null };
  return {
    imageUrl: image.regular_url || image.medium_url || image.original_url || image.small_url || null,
    imageSourceUrl: image.original_url || image.regular_url || null,
    imageLicense: image.license_name ?? null,
    imageLicenseUrl: image.license_url ?? null,
  };
}

const WATERING_DAYS: Record<string, number> = {
  frequent: 3,
  average: 7,
  minimum: 14,
  none: 30,
};

const CARE_LEVEL_LABEL: Record<string, string> = {
  low: "Facile",
  medium: "Modéré",
  moderate: "Modéré",
  high: "Exigeant",
};

/**
 * Les valeurs reelles observees dans l'API ("part shade", "part sun/part
 * shade"...) ne correspondent pas exactement aux enums documentees
 * (snake_case) -- on classe donc par mots-cles plutot que par egalite stricte.
 */
function normalizeSunlight(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("part") || s.includes("filtered")) return "Mi-ombre";
  if (s.includes("full shade") || s === "shade") return "Ombre";
  if (s.includes("full sun") || s.includes("sun")) return "Plein soleil";
  return raw;
}

/**
 * Convertit les champs qualitatifs de Perenual (pas d'intervalle en jours,
 * pas d'unite standard) en un profil approximatif compatible avec notre
 * moteur de recurrence. C'est un point de depart -- l'utilisateur ajuste
 * ensuite, comme pour n'importe quelle fiche de la bibliotheque.
 */
export function mapCareProfile(details: PerenualSpeciesDetails): MappedCareProfile {
  const profile: MappedCareProfile = {};

  const benchmark = details.watering_general_benchmark;
  const benchmarkValue = benchmark?.value ? parseFloat(benchmark.value.split("-")[0]) : null;
  const days =
    benchmarkValue && benchmark?.unit?.toLowerCase().startsWith("day")
      ? Math.round(benchmarkValue)
      : (details.watering && WATERING_DAYS[details.watering.toLowerCase()]) || null;
  if (days) {
    profile.watering = { recurrenceType: "FIXED_INTERVAL_DAYS", interval: days };
  }

  if (details.sunlight?.length) {
    const labels = Array.from(new Set(details.sunlight.map(normalizeSunlight).filter(Boolean)));
    profile.exposure = labels.join(" / ");
  }

  if (details.indoor !== undefined) {
    profile.humidity = details.indoor ? "Moyenne (adapte a l'interieur)" : undefined;
  }

  const poisonHuman = Boolean(details.poisonous_to_humans);
  const poisonPet = Boolean(details.poisonous_to_pets);
  if (poisonHuman || poisonPet) {
    const parts = [];
    if (poisonHuman) parts.push("toxique pour l'humain");
    if (poisonPet) parts.push("toxique pour les animaux");
    profile.toxicity = parts.join(", ");
  } else if (details.poisonous_to_humans !== undefined || details.poisonous_to_pets !== undefined) {
    profile.toxicity = "Non toxique connue";
  }

  if (details.care_level) profile.careLevel = CARE_LEVEL_LABEL[details.care_level.toLowerCase()] ?? details.care_level;

  // `description` est un texte libre en anglais (pas de version francaise
  // proposee par Perenual) -- volontairement exclu des tips pour ne pas
  // meler de l'anglais brut a une application en francais.

  const image = mapImage(details);
  if (image.imageUrl) profile.imageUrl = image.imageUrl;

  return profile;
}
