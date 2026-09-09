export type ExternalSource = "OPENPLANTBOOK" | "PERENUAL";

export interface ExternalPreview {
  source: ExternalSource;
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  thumbnailUrl: string | null;
}

export interface ExternalCareProfile {
  exposure?: string;
  temperatureRange?: string;
  humidity?: string;
  toxicity?: string;
  tips?: string;
  imageUrl?: string;
  careLevel?: string;
  watering?: { recurrenceType: "FIXED_INTERVAL_DAYS"; interval: number };
}

export interface ExternalImageMeta {
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
}

export interface ExternalDetails {
  source: ExternalSource;
  sourceId: string;
  commonName: string;
  scientificName: string | null;
  family: string | null;
  careProfile: ExternalCareProfile;
  image: ExternalImageMeta;
  /** true si un champ cle (l'arrosage) manquait a la source principale et a ete complete par une source secondaire. */
  completedFrom?: ExternalSource;
}

export interface ExternalProvider {
  source: ExternalSource;
  label: string;
  isConfigured(): boolean;
  search(query: string): Promise<ExternalPreview[]>;
  getDetails(sourceId: string): Promise<ExternalDetails>;
}
