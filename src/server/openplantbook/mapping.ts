import type { PlantbookDetail, PlantbookSearchItem } from "./client";

export interface ExternalSpeciesPreview {
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  thumbnailUrl: string | null;
}

export interface MappedCareProfile {
  exposure?: string;
  temperatureRange?: string;
  humidity?: string;
  tips?: string;
  imageUrl?: string;
  // Pas de `watering` : OpenPlantbook documente des seuils d'humidite du sol
  // (pense pour un capteur), pas une frequence calendaire -- voir
  // `providers.ts` pour le complement automatique via Perenual le cas echeant.
}

export interface MappedImageMeta {
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
}

/** `category` est de la forme "Famille, Genre" -- on ne garde que la famille. */
export function extractFamily(category?: string | null): string | null {
  return category?.split(",")[0]?.trim() || null;
}

/** `pid` ("genus species") sert de nom scientifique ; `display_pid`/`alias` de nom usuel. */
export function toPreview(item: PlantbookSearchItem): ExternalSpeciesPreview {
  const scientificName = item.pid?.trim() || null;
  return {
    sourceId: item.pid,
    commonName: item.display_pid?.trim() || item.alias?.trim() || scientificName || "Espèce sans nom",
    scientificName,
    family: null,
    thumbnailUrl: null,
  };
}

export function mapImage(detail: PlantbookDetail): MappedImageMeta {
  if (!detail.image_url) return { imageUrl: null, imageSourceUrl: null, imageLicense: null, imageLicenseUrl: null };
  return { imageUrl: detail.image_url, imageSourceUrl: detail.image_url, imageLicense: null, imageLicenseUrl: null };
}

export function mapCareProfile(detail: PlantbookDetail): MappedCareProfile {
  const profile: MappedCareProfile = {};

  if (detail.min_temp != null && detail.max_temp != null) {
    profile.temperatureRange = `${detail.min_temp}-${detail.max_temp}°C`;
  }
  if (detail.min_env_humid != null && detail.max_env_humid != null) {
    profile.humidity = `${detail.min_env_humid}-${detail.max_env_humid}%`;
  }
  if (detail.min_light_lux != null && detail.max_light_lux != null) {
    profile.exposure = `${detail.min_light_lux}-${detail.max_light_lux} lux`;
  } else if (detail.min_light_mmol != null && detail.max_light_mmol != null) {
    profile.exposure = `${detail.min_light_mmol}-${detail.max_light_mmol} mol/m²/j (DLI)`;
  }

  if (detail.min_soil_moist != null && detail.max_soil_moist != null) {
    profile.tips = `Seuils capteur (OpenPlantbook) : humidité du sol cible ${detail.min_soil_moist}-${detail.max_soil_moist}%` +
      (detail.min_soil_ec != null && detail.max_soil_ec != null ? `, conductivité ${detail.min_soil_ec}-${detail.max_soil_ec} mS/cm.` : ".");
  }

  const image = mapImage(detail);
  if (image.imageUrl) profile.imageUrl = image.imageUrl;

  return profile;
}
