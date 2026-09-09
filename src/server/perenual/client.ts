/**
 * Client bas niveau pour l'API Perenual (https://www.perenual.com/docs/api).
 * Source externe principale pour completer la bibliotheque locale sans avoir
 * a saisir une fiche a la main pour chaque nouvelle espece.
 *
 * Le quota exact du plan gratuit n'est pas documente publiquement (voir
 * discussion) -- on suppose donc un quota bas et on n'appelle Perenual que
 * sur action explicite de l'utilisateur (jamais en arriere-plan ni a chaque
 * frappe clavier), jamais pour re-afficher une fiche deja importee.
 */

const BASE_URL = "https://www.perenual.com/api/v2";

export class PerenualError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "PerenualError";
  }
}

function getApiKey(): string {
  const key = process.env.PERENUAL_API_KEY;
  if (!key) {
    throw new PerenualError("Cle API Perenual absente (PERENUAL_API_KEY).");
  }
  return key;
}

async function perenualFetch<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("key", getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) {
    throw new PerenualError("Quota Perenual atteint, reessayer plus tard.", 429);
  }
  if (!res.ok) {
    throw new PerenualError(`Perenual a repondu ${res.status}.`, res.status);
  }
  return (await res.json()) as T;
}

export interface PerenualImageVariants {
  license?: number;
  license_name?: string;
  license_url?: string;
  original_url?: string;
  regular_url?: string;
  medium_url?: string;
  small_url?: string;
  thumbnail?: string;
}

export interface PerenualSpeciesListItem {
  id: number;
  common_name?: string;
  scientific_name?: string[];
  family?: string | null;
  default_image?: PerenualImageVariants | null;
}

export interface PerenualSpeciesListResponse {
  data: PerenualSpeciesListItem[];
  total: number;
  current_page: number;
  last_page: number;
}

export interface PerenualSpeciesDetails extends PerenualSpeciesListItem {
  watering?: string;
  watering_general_benchmark?: { value?: string; unit?: string } | null;
  sunlight?: string[];
  cycle?: string;
  care_level?: string;
  indoor?: boolean;
  poisonous_to_humans?: number | boolean;
  poisonous_to_pets?: number | boolean;
  pruning_month?: string[];
  description?: string;
}

export function searchPerenualSpecies(query: string, page = 1): Promise<PerenualSpeciesListResponse> {
  return perenualFetch<PerenualSpeciesListResponse>("/species-list", { q: query, page });
}

export function getPerenualSpeciesDetails(id: number | string): Promise<PerenualSpeciesDetails> {
  return perenualFetch<PerenualSpeciesDetails>(`/species/details/${id}`);
}
