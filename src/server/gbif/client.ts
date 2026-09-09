/**
 * Photos de reference via l'API publique GBIF (aucune cle requise). 3e
 * source d'images, apres OpenPlantbook et iNaturalist -- GBIF agrege des
 * dizaines de fournisseurs (herbiers, museums, iNaturalist lui-meme...),
 * utile quand les deux premieres sources n'ont rien trouve.
 *
 * Comme pour iNaturalist : ne jamais prendre une occurrence a l'aveugle,
 * verifier explicitement que sa licence est une licence ouverte connue.
 */

const BASE_URL = "https://api.gbif.org/v1";
const USER_AGENT = "PlantManagerHomelab/1.0 (self-hosted personal app, non-commercial; contact: fc.carlier@gmail.com)";
const OPEN_LICENSE_PATTERN = /creativecommons\.org\/(licenses|publicdomain)/i;

export interface GbifPhoto {
  url: string;
  attribution: string;
  licenseUrl: string;
  observationUrl: string | null;
}

async function gbifFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface SpeciesMatch {
  usageKey: number;
  matchType: "EXACT" | "FUZZY" | "HIGHERRANK" | "NONE";
  confidence: number;
  rank: string;
  status: string;
  acceptedUsageKey?: number;
}

async function findTaxonKey(scientificName: string): Promise<number | null> {
  const match = await gbifFetch<SpeciesMatch>(`/species/match?name=${encodeURIComponent(scientificName)}`);
  if (!match || match.matchType === "NONE" || match.confidence < 90) return null;
  if (!["SPECIES", "SUBSPECIES", "VARIETY", "GENUS"].includes(match.rank)) return null;
  // Un synonyme pointe vers le taxon accepte -- chercher des photos sous ce
  // taxon-la, jamais sous le synonyme (l'occurrence y serait rarement liee).
  return match.status === "SYNONYM" && match.acceptedUsageKey ? match.acceptedUsageKey : match.usageKey;
}

interface OccurrenceSearchResult {
  results: {
    key: number;
    license?: string;
    media?: { type: string; identifier?: string; creator?: string; rightsHolder?: string; references?: string }[];
  }[];
}

/** Cherche une photo sous licence ouverte pour un nom scientifique donne, ou null. */
export async function findOpenLicensedPhoto(scientificName: string): Promise<GbifPhoto | null> {
  const taxonKey = await findTaxonKey(scientificName);
  if (!taxonKey) return null;

  const body = await gbifFetch<OccurrenceSearchResult>(
    `/occurrence/search?taxonKey=${taxonKey}&mediaType=StillImage&limit=20`,
  );

  for (const occurrence of body?.results ?? []) {
    if (!occurrence.license || !OPEN_LICENSE_PATTERN.test(occurrence.license)) continue;
    const photo = occurrence.media?.find((m) => m.type === "StillImage" && m.identifier);
    if (!photo?.identifier) continue;

    const author = photo.rightsHolder || photo.creator || "auteur inconnu";
    return {
      url: photo.identifier,
      attribution: `(c) ${author}, via GBIF`,
      licenseUrl: occurrence.license,
      observationUrl: photo.references ?? null,
    };
  }
  return null;
}
